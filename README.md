# Chargeback

Shopify chargeback dispute responder powered by the Claude API. Receives a
Shopify `disputes/create` webhook, fetches the order/customer/fulfilment
context, sends it to Claude with a structured prompt, and returns
validated JSON evidence ready to be rendered into a PDF and submitted to
the issuing bank.

Deployed on Vercel. API keys live in Vercel environment variables.

## Pipeline

```
Shopify webhook  →  /api/shopify-webhook  →  /api/process-dispute
                       (HMAC verify)            (fetch → filter → Claude → validate)
                                                      ↓
                                              [TODO] PDF + merchant review + submit
```

## Files

| Path | Purpose |
|---|---|
| `api/shopify-webhook.js` | Webhook receiver. Verifies HMAC, dispatches processor, acks 200 fast. |
| `api/process-dispute.js` | Worker. Fetches Shopify data, calls Claude, validates output. |
| `lib/shopify.js` | Shopify Admin REST client (dispute, order, customer, fulfilments, transactions). |
| `lib/filter.js` | Trims raw Shopify objects to the fields Claude actually needs (saves tokens). |
| `lib/prompts.js` | System prompt + user template. The single source of truth for prompt tuning. |
| `lib/claude.js` | Anthropic SDK call. Uses prompt caching on the system prompt. |
| `lib/validate.js` | Strips fences, parses JSON, validates schema. Fails loud on bad output. |
| `lib/hmac.js` | Shopify webhook HMAC verification. |
| `tests/fixtures/sample_dispute.json` | Sample payload — `product_not_received` with strong evidence. |
| `tests/run-fixture.js` | Local end-to-end test (skips Shopify, hits Claude). |

## Environment variables

Set these in Vercel (Project Settings → Environment Variables). See
`.env.example` for a copy.

| Variable | Notes |
|---|---|
| `SHOPIFY_SHOP_DOMAIN` | e.g. `your-store.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Custom app token with `read_orders`, `read_customers`, `read_shopify_payments_disputes` |
| `SHOPIFY_WEBHOOK_SECRET` | The shared secret Shopify uses to sign webhooks |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-4-6`. Switch to `claude-opus-4-7` only if Sonnet output looks weak in QA. |
| `INTERNAL_PROCESS_SECRET` | Long random string. Authenticates the webhook → processor handoff. |

## Local testing

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run test:fixture
```

Runs the full pipeline against `tests/fixtures/sample_dispute.json`,
skipping Shopify. Prints filtered context, Claude usage, and validated
evidence JSON.

## Status (v0)

Done:
- Webhook receiver with HMAC verification
- Shopify Admin API client
- Payload filtering
- Claude call with prompt caching
- JSON parsing + schema validation
- Fixture-based local test

TODO (in order):
- PDF generator from validated JSON
- Storage of raw responses + generated PDFs for audit
- Merchant review/approval gate (do NOT auto-submit — `missing_evidence_flags` need a human to attach extras)
- Submit to Shopify dispute evidence API on approval
- Observability: log inputs, outputs, and dispute outcomes to see whether the prompt is actually winning disputes

## Important

- **Do not auto-submit.** The prompt asks Claude to flag missing evidence; that signal is wasted if a human doesn't attach those extras before the response goes to the bank.
- **Default to Sonnet 4.6.** The output is structured JSON with constrained content. Opus costs ~5× and buys little here. Reserve Opus for cases where Sonnet output is visibly weak in review.
