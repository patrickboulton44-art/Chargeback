import { getAdminClient } from '../lib/supabase.js';
import { decrypt } from '../lib/encryption.js';
import { fetchDisputeContext } from '../lib/shopify.js';
import {
  filterDispute,
  filterOrder,
  filterCustomer,
  filterFulfilments,
  filterTransactions,
} from '../lib/filter.js';
import { generateDisputeResponse } from '../lib/claude.js';
import { parseAndValidate } from '../lib/validate.js';

// Multi-tenant processor. Loads the merchant's encrypted access token from
// Supabase, fetches dispute context, runs Claude, persists the result.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (req.headers['x-internal-secret'] !== process.env.SHOPIFY_API_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const { shopDomain, disputeId, topic } = req.body || {};
  if (!shopDomain || !disputeId) {
    res.status(400).json({ error: 'missing_params' });
    return;
  }

  try {
    const supabase = getAdminClient();

    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('shop_domain, encrypted_access_token, uninstalled_at')
      .eq('shop_domain', shopDomain)
      .single();

    if (shopError || !shop) throw new Error('shop_not_found');
    if (shop.uninstalled_at) throw new Error('shop_uninstalled');

    const accessToken = decrypt(shop.encrypted_access_token);

    const raw = await fetchDisputeContext(disputeId, {
      shop: shopDomain,
      accessToken,
    });

    const filtered = {
      dispute: filterDispute(raw.dispute),
      order: filterOrder(raw.order),
      customer: filterCustomer(raw.customer),
      fulfilments: filterFulfilments(raw.fulfilments),
      transactions: filterTransactions(raw.transactions),
    };

    const claudeResult = await generateDisputeResponse(filtered);
    const evidence = parseAndValidate(claudeResult.raw);

    const { error: upsertError } = await supabase.from('disputes').upsert(
      {
        shop_domain: shopDomain,
        shopify_dispute_id: disputeId,
        shopify_order_id: raw.dispute.order_id,
        status: 'drafted',
        reason: raw.dispute.reason,
        amount: raw.dispute.amount,
        currency: raw.dispute.currency,
        evidence_due_by: raw.dispute.evidence_due_by,
        claude_response: evidence,
        claude_usage: claudeResult.usage,
        raw_dispute: raw.dispute,
        last_topic: topic || null,
      },
      { onConflict: 'shop_domain,shopify_dispute_id' }
    );

    if (upsertError) throw upsertError;

    res.status(200).json({ ok: true, disputeId, model: claudeResult.model });
  } catch (err) {
    console.error('process-dispute failed', err);
    res.status(500).json({ error: 'process_failed', message: err.message });
  }
}
