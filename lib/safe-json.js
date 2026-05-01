// Shopify resource IDs are 64-bit integers and now exceed JavaScript's
// Number.MAX_SAFE_INTEGER (2^53 - 1) for some merchants. Standard JSON.parse
// silently truncates these. We use json-bigint configured to store BigInts as
// strings, which preserves the full ID and is JSON-stringifiable for storage
// in Supabase JSONB columns or DB text columns.

import JSONbig from 'json-bigint';

const parser = JSONbig({ storeAsString: true, useNativeBigInt: false });

export function parseShopifyJson(str) {
  return parser.parse(str);
}
