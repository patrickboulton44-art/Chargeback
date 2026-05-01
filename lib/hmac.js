import crypto from 'node:crypto';

// Verify Shopify webhook HMAC. Webhooks registered via OAuth are signed with the
// app's API secret (SHOPIFY_API_SECRET) — one secret across all installed shops.
// The raw request body must be passed in as a Buffer/string — re-stringifying
// parsed JSON will not match.
export function verifyWebhookHmac(rawBody, headerHmac) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error('Missing SHOPIFY_API_SECRET');
  if (!headerHmac || typeof headerHmac !== 'string') return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(headerHmac);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
