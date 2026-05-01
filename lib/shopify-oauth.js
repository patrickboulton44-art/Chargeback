// Shopify OAuth helpers: shop validation, authorize URL, HMAC verify on callback,
// code-for-token exchange, and programmatic webhook registration.

import crypto from 'node:crypto';

const SCOPES = 'read_orders,read_customers,read_shopify_payments_disputes';
const APP_URL = process.env.SHOPIFY_APP_URL || 'https://chargeback-chi.vercel.app';
const API_VERSION = '2025-01';
const WEBHOOK_TOPICS = ['disputes/create', 'disputes/update', 'app/uninstalled'];

export function getAppUrl() {
  return APP_URL;
}

export function normalizeShop(input) {
  if (typeof input !== 'string') return null;
  let shop = input.trim().toLowerCase();
  if (!shop) return null;
  shop = shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!shop.includes('.')) shop = `${shop}.myshopify.com`;
  return shop;
}

export function isValidShopDomain(shop) {
  if (typeof shop !== 'string') return false;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

export function buildAuthorizeUrl({ shop, state }) {
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) throw new Error('Missing SHOPIFY_API_KEY');
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: SCOPES,
    redirect_uri: `${APP_URL}/api/auth/shopify/callback`,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

// Verify HMAC on OAuth callback query params (Shopify signs with the app secret).
// The hmac param is excluded from the message; remaining params are sorted by key.
export function verifyOauthCallbackHmac(query) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error('Missing SHOPIFY_API_SECRET');
  if (!query || typeof query !== 'object') return false;
  const { hmac, signature, ...rest } = query;
  if (!hmac || typeof hmac !== 'string') return false;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(rest[k]))}`)
    .join('&');
  const computed = crypto.createHmac('sha256', secret).update(message).digest('hex');
  try {
    const a = Buffer.from(computed);
    const b = Buffer.from(hmac);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function exchangeCodeForToken({ shop, code }) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json(); // { access_token, scope }
}

export async function registerWebhooks({ shop, accessToken }) {
  const callbackUrl = `${APP_URL}/api/shopify-webhook`;
  const results = [];
  for (const topic of WEBHOOK_TOPICS) {
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook: { topic, address: callbackUrl, format: 'json' },
      }),
    });
    const text = await res.text();
    // 422 with "address has already been taken" is fine — webhook already registered
    const ok = res.ok || (res.status === 422 && /already been taken/i.test(text));
    results.push({ topic, status: res.status, ok, body: text.slice(0, 200) });
  }
  return results;
}
