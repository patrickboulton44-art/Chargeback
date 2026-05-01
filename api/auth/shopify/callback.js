import {
  isValidShopDomain,
  verifyOauthCallbackHmac,
  exchangeCodeForToken,
  registerWebhooks,
} from '../../../lib/shopify-oauth.js';
import { consumeOauthStateCookie, setSessionCookie } from '../../../lib/session.js';
import { encrypt } from '../../../lib/encryption.js';
import { getAdminClient } from '../../../lib/supabase.js';

// GET /api/auth/shopify/callback
// Shopify redirects here after the merchant clicks "Install" with:
//   ?code=...&hmac=...&shop=<store>.myshopify.com&state=...&timestamp=...
// We verify HMAC + state, exchange the code, encrypt and persist the token,
// register webhooks, set the session cookie, and 302 to /dashboard.

export default async function handler(req, res) {
  const query = req.query || {};
  const { shop, code, state } = query;

  if (!shop || !code || !state || typeof shop !== 'string') {
    res.status(400).send(errorPage('Missing required OAuth parameters.'));
    return;
  }

  if (!isValidShopDomain(shop)) {
    res.status(400).send(errorPage('Invalid shop domain.'));
    return;
  }

  if (!verifyOauthCallbackHmac(query)) {
    res.status(401).send(errorPage('OAuth signature did not verify. Please retry the install.'));
    return;
  }

  const stored = consumeOauthStateCookie(req, res);
  if (!stored || stored.state !== state || stored.shop !== shop) {
    res.status(401).send(errorPage('OAuth state mismatch. Please retry the install.'));
    return;
  }

  let tokenResp;
  try {
    tokenResp = await exchangeCodeForToken({ shop, code });
  } catch (err) {
    console.error('token exchange failed', err);
    res.status(502).send(errorPage('Could not exchange code for an access token.'));
    return;
  }

  const accessToken = tokenResp.access_token;
  const scopes = tokenResp.scope || '';

  let encrypted;
  try {
    encrypted = encrypt(accessToken);
  } catch (err) {
    console.error('token encryption failed', err);
    res.status(500).send(errorPage('Server is missing or has invalid ENCRYPTION_KEY.'));
    return;
  }

  const supabase = getAdminClient();
  const { error: upsertError } = await supabase.from('shops').upsert(
    {
      shop_domain: shop,
      encrypted_access_token: encrypted,
      scopes,
      installed_at: new Date().toISOString(),
      uninstalled_at: null,
    },
    { onConflict: 'shop_domain' }
  );

  if (upsertError) {
    console.error('shop upsert failed', upsertError);
    res.status(500).send(errorPage('Could not persist the shop installation.'));
    return;
  }

  // Register webhooks. Don't fail the install if a webhook registration errors —
  // we'll surface it in the dashboard so the merchant can retry.
  try {
    const results = await registerWebhooks({ shop, accessToken });
    const failed = results.filter((r) => !r.ok);
    if (failed.length) console.warn('webhook registration partially failed', failed);
  } catch (err) {
    console.error('webhook registration threw', err);
  }

  setSessionCookie(res, { shop_domain: shop });
  res.writeHead(302, { Location: '/dashboard' });
  res.end();
}

function errorPage(message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Chargeback — install failed</title>
  <style>body{font-family:system-ui;background:#07040f;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
  .box{max-width:480px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:32px;border-radius:16px}
  a{color:#c084fc}</style></head><body><div class="box"><h1 style="margin-top:0">Install failed</h1>
  <p>${message}</p><p><a href="/">← Back to Chargeback</a></p></div></body></html>`;
}
