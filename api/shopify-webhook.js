import { verifyWebhookHmac } from '../lib/hmac.js';
import { getAdminClient } from '../lib/supabase.js';

// Multi-tenant webhook receiver. One URL, all installed shops.
// Topics handled:
//   - disputes/create, disputes/update → dispatch to processor
//   - app/uninstalled → mark shop uninstalled
//
// Shopify retries on 5xx or >5s response, so ack fast.

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    res.status(400).json({ error: 'cannot_read_body' });
    return;
  }

  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(rawBody, hmac)) {
    res.status(401).json({ error: 'invalid_hmac' });
    return;
  }

  const shopDomain = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];
  if (!shopDomain || typeof shopDomain !== 'string') {
    res.status(400).json({ error: 'missing_shop_domain' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }

  const supabase = getAdminClient();

  if (topic === 'app/uninstalled') {
    await supabase
      .from('shops')
      .update({ uninstalled_at: new Date().toISOString() })
      .eq('shop_domain', shopDomain);
    res.status(200).json({ ok: true });
    return;
  }

  if (topic !== 'disputes/create' && topic !== 'disputes/update') {
    // Unknown topic — ack so Shopify doesn't retry, but do nothing.
    res.status(200).json({ ok: true, ignored: topic });
    return;
  }

  const disputeId = payload?.id;
  if (!disputeId) {
    res.status(400).json({ error: 'missing_dispute_id' });
    return;
  }

  // Confirm the shop is known + installed before doing real work.
  const { data: shop, error } = await supabase
    .from('shops')
    .select('shop_domain, uninstalled_at')
    .eq('shop_domain', shopDomain)
    .maybeSingle();

  if (error || !shop) {
    res.status(404).json({ error: 'shop_not_found' });
    return;
  }
  if (shop.uninstalled_at) {
    res.status(410).json({ error: 'shop_uninstalled' });
    return;
  }

  // Dispatch to processor (fire-and-forget). Production should use a queue.
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const url = `${proto}://${host}/api/process-dispute`;

  fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': process.env.SHOPIFY_API_SECRET || '',
    },
    body: JSON.stringify({ shopDomain, disputeId, topic }),
  }).catch((err) => console.error('processor dispatch failed', err));

  res.status(200).json({ ok: true, disputeId });
}
