import { verifyShopifyHmac } from '../lib/hmac.js';

// Vercel serverless entrypoint for Shopify dispute webhooks.
// Subscribe at: https://{shop}.myshopify.com/admin/settings/notifications
// Topics: disputes/create, disputes/update
//
// We verify HMAC on the raw body, ack with 200 fast, and fire-and-forget
// the heavy processing job. Shopify retries if we 5xx or take >5s.

export const config = {
  api: { bodyParser: false },
};

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
  if (!verifyShopifyHmac(rawBody, hmac)) {
    res.status(401).json({ error: 'invalid_hmac' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }

  const disputeId = payload?.id;
  if (!disputeId) {
    res.status(400).json({ error: 'missing_dispute_id' });
    return;
  }

  // Ack immediately. Kick off the processor without awaiting so Shopify
  // doesn't time out. In production this would push to a queue (Inngest,
  // QStash, etc.) for retries — for v0 we self-invoke the processor.
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const url = `${proto}://${host}/api/process-dispute`;

  fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_PROCESS_SECRET || '',
    },
    body: JSON.stringify({ disputeId }),
  }).catch((err) => {
    console.error('failed to dispatch processor', err);
  });

  res.status(200).json({ ok: true, disputeId });
}
