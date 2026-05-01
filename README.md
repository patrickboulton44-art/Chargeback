# Chargeback

Multi-tenant Shopify chargeback dispute responder powered by the Claude API.
Merchants click "Install on Shopify" → we receive their dispute webhooks →
Claude drafts a structured response → merchant reviews and submits to the bank.

Deployed on Vercel. Postgres on Supabase. Static landing + serverless functions.

## Pipeline

```
Merchant
  └─ enters shop domain → /api/auth/shopify/install
                                ↓ (302)
                            Shopify OAuth
                                ↓ (302 with code)
                          /api/auth/shopify/callback
                                ↓
                  exchange code, encrypt token, persist to Supabase,
                  programmatically register webhooks, set session cookie
                                ↓ (302)
                              /dashboard

Shopify dispute fires
  └─ /api/shopify-webhook  (HMAC verify, lookup shop)
        └─ /api/process-dispute  (decrypt token, fetch context, Claude, persist)

Merchant signs back in
  └─ /dashboard  (server-rendered, gated on signed session cookie)
```

## File map

| Path | Purpose |
|---|---|
| `index.html` | Landing page. Install form posts to `/api/auth/shopify/install`. |
| `api/auth/shopify/install.js` | Validates shop, sets CSRF state cookie, redirects to Shopify OAuth. |
| `api/auth/shopify/callback.js` | Verifies HMAC + state, exchanges code, encrypts token, registers webhooks, sets session, redirects to dashboard. |
| `api/auth/logout.js` | Clears session cookie. |
| `api/dashboard.js` | Server-rendered dashboard. Auth-gated. Lists recent disputes. (Aliased to `/dashboard` via `vercel.json` rewrite.) |
| `api/shopify-webhook.js` | Multi-tenant webhook receiver. HMAC, shop lookup, dispatch. Handles `disputes/create`, `disputes/update`, `app/uninstalled`. |
| `api/process-dispute.js` | Worker. Loads encrypted token, fetches Shopify context, calls Claude, persists drafted response. |
| `lib/encryption.js` | AES-256-GCM for tokens at rest. |
| `lib/supabase.js` | Supabase admin client (service-role, bypasses RLS). |
| `lib/session.js` | HMAC-signed session + OAuth state cookies. |
| `lib/cookies.js` | Tiny cookie parse/serialize helpers. |
| `lib/shopify-oauth.js` | OAuth URL builder, HMAC verify, token exchange, programmatic webhook registration. |
| `lib/shopify.js` | Multi-tenant Admin REST client (caller passes `{ shop, accessToken }`). |
| `lib/hmac.js` | Webhook HMAC verify (uses `SHOPIFY_API_SECRET`). |
| `lib/filter.js` | Trims raw Shopify objects to the fields Claude needs. |
| `lib/prompts.js` | System prompt + user template. |
| `lib/claude.js` | Anthropic SDK call with system-prompt caching. |
| `lib/validate.js` | Strips fences, parses JSON, validates schema. |
| `supabase/schema.sql` | Tables, indexes, RLS. Run once in Supabase SQL editor. |
| `tests/run-fixture.js` | Local Claude pipeline test against `tests/fixtures/sample_dispute.json`. |

## Setup

### 1. Supabase
Open Supabase → SQL Editor → paste `supabase/schema.sql` → Run. Creates the
`shops` and `disputes` tables with RLS enabled.

### 2. Shopify Partners app
Create an app in the [Partners Dashboard](https://partners.shopify.com).
- App URL: `https://chargeback-chi.vercel.app/`
- Redirect URL: `https://chargeback-chi.vercel.app/api/auth/shopify/callback`
- Scopes: `read_orders,read_customers,read_shopify_payments_disputes`

Copy the Client ID and Client secret.

### 3. Vercel environment variables
| Variable | Notes |
|---|---|
| `SHOPIFY_API_KEY` | Shopify Client ID |
| `SHOPIFY_API_SECRET` | Shopify Client secret. Also signs session cookies + verifies webhook HMAC. |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-4-6`. |
| `SUPABASE_URL` | e.g. `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Public/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret. Bypasses RLS. Server-only. |
| `ENCRYPTION_KEY` | Base64 of 32 random bytes (`openssl rand -base64 32`). Encrypts Shopify access tokens at rest. |
| `SHOPIFY_APP_URL` | Optional override. Defaults to `https://chargeback-chi.vercel.app`. |

### 4. Install on a dev store
- Visit `https://chargeback-chi.vercel.app/`
- Enter your `*.myshopify.com` domain → Get started
- Approve the OAuth screen → land on `/dashboard`

## Local testing

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run test:fixture
```

Runs the Claude pipeline against `tests/fixtures/sample_dispute.json`,
skipping Shopify and Supabase. Useful for prompt iteration.

## Status

**Done**
- Multi-tenant Shopify OAuth install flow
- Programmatic webhook registration
- Encrypted token storage in Supabase
- Multi-tenant webhook receiver + processor
- Session-gated server-rendered dashboard
- Landing page with install form

**Next**
- PDF generator from Claude's structured response
- Merchant approval gate before submission to Shopify
- Submission to Shopify dispute evidence API
- Dispute detail page (review & approve UI)
- Observability: log inputs/outputs and outcomes

## Important

- **Do not auto-submit to the bank.** Claude flags missing evidence; that signal is wasted unless a human attaches the extras (signed delivery proof, CS email threads, listing screenshots) before submission.
- **Default to Sonnet 4.6.** Output is structured JSON with constrained content. Opus costs ~5× and buys little here.
