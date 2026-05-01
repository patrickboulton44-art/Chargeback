// Shopify Admin REST client. Multi-tenant: caller passes { shop, accessToken }.
// All response parsing goes through parseShopifyJson to preserve 64-bit IDs.

import { parseShopifyJson } from './safe-json.js';

const API_VERSION = '2025-01';

async function shopifyGet(ctx, path) {
  if (!ctx?.shop || !ctx?.accessToken) {
    throw new Error('shopifyGet requires { shop, accessToken }');
  }
  const url = `https://${ctx.shop}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': ctx.accessToken,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopify ${res.status} on ${path}: ${text.slice(0, 500)}`);
  }
  try {
    return parseShopifyJson(text);
  } catch (err) {
    throw new Error(`Shopify ${path}: invalid JSON response (${err.message})`);
  }
}

export async function getDispute(disputeId, ctx) {
  const data = await shopifyGet(ctx, `/shopify_payments/disputes/${disputeId}.json`);
  return data.dispute;
}

export async function getOrder(orderId, ctx) {
  const data = await shopifyGet(ctx, `/orders/${orderId}.json`);
  return data.order;
}

export async function getCustomer(customerId, ctx) {
  if (!customerId) return null;
  const data = await shopifyGet(ctx, `/customers/${customerId}.json`);
  return data.customer;
}

export async function getFulfilments(orderId, ctx) {
  const data = await shopifyGet(ctx, `/orders/${orderId}/fulfillments.json`);
  return data.fulfillments || [];
}

export async function getTransactions(orderId, ctx) {
  const data = await shopifyGet(ctx, `/orders/${orderId}/transactions.json`);
  return data.transactions || [];
}

export async function fetchDisputeContext(disputeId, ctx) {
  const dispute = await getDispute(disputeId, ctx);
  const order = await getOrder(dispute.order_id, ctx);
  const [customer, fulfilments, transactions] = await Promise.all([
    getCustomer(order.customer?.id, ctx),
    getFulfilments(dispute.order_id, ctx),
    getTransactions(dispute.order_id, ctx),
  ]);
  return { dispute, order, customer, fulfilments, transactions };
}
