import crypto from 'node:crypto';

// Verify Shopify webhook HMAC. The raw request body must be passed in as a
// Buffer/string — re-stringifying parsed JSON will not match.
export function verifyShopifyHmac(rawBody, headerHmac) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) throw new Error('Missing SHOPIFY_WEBHOOK_SECRET');
  if (!headerHmac) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerHmac));
  } catch {
    return false;
  }
}
