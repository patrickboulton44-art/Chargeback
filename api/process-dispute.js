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

// Heavy worker: fetch Shopify context, run Claude, validate output.
// PDF generation + merchant review handoff + Shopify evidence submission
// are stubbed below — fill in as the project progresses.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (req.headers['x-internal-secret'] !== process.env.INTERNAL_PROCESS_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const { disputeId } = req.body || {};
  if (!disputeId) {
    res.status(400).json({ error: 'missing_dispute_id' });
    return;
  }

  try {
    const raw = await fetchDisputeContext(disputeId);

    const filtered = {
      dispute: filterDispute(raw.dispute),
      order: filterOrder(raw.order),
      customer: filterCustomer(raw.customer),
      fulfilments: filterFulfilments(raw.fulfilments),
      transactions: filterTransactions(raw.transactions),
    };

    const claudeResult = await generateDisputeResponse(filtered);
    const evidence = parseAndValidate(claudeResult.raw);

    // TODO: render PDF from `evidence`
    // TODO: store PDF + raw response for audit
    // TODO: notify merchant for review/approval (do NOT auto-submit)
    // TODO: on merchant approval, submit to Shopify dispute evidence API

    res.status(200).json({
      ok: true,
      disputeId,
      model: claudeResult.model,
      usage: claudeResult.usage,
      evidence,
    });
  } catch (err) {
    console.error('process-dispute failed', err);
    res.status(500).json({ error: 'process_failed', message: err.message });
  }
}
