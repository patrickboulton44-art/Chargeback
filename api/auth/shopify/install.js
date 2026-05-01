import crypto from 'node:crypto';
import {
  normalizeShop,
  isValidShopDomain,
  buildAuthorizeUrl,
} from '../../../lib/shopify-oauth.js';
import { setOauthStateCookie } from '../../../lib/session.js';

// GET /api/auth/shopify/install?shop=<store>.myshopify.com
// Validates the shop, sets a signed CSRF state cookie, and 302s to Shopify's
// OAuth authorize page.

export default async function handler(req, res) {
  const rawShop = (req.query?.shop || '').toString();
  const shop = normalizeShop(rawShop);

  if (!shop || !isValidShopDomain(shop)) {
    res.status(400).send(htmlError('Enter a valid shop domain like <code>your-store.myshopify.com</code>.'));
    return;
  }

  const state = crypto.randomBytes(24).toString('base64url');
  setOauthStateCookie(res, { state, shop, ts: Date.now() });

  const authorizeUrl = buildAuthorizeUrl({ shop, state });
  res.writeHead(302, { Location: authorizeUrl });
  res.end();
}

function htmlError(message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Chargeback — error</title>
  <style>body{font-family:system-ui;background:#07040f;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
  .box{max-width:480px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:32px;border-radius:16px}
  a{color:#c084fc}code{background:rgba(168,85,247,0.15);padding:2px 6px;border-radius:4px}</style>
  </head><body><div class="box"><h1 style="margin-top:0">Couldn't start install</h1><p>${message}</p>
  <p><a href="/">← Back to Chargeback</a></p></div></body></html>`;
}
