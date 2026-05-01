// Minimal Shopify Admin REST client for fetching dispute context.
// We use REST rather than GraphQL because dispute payloads are small and
// the REST endpoints map 1:1 to what we need.

const API_VERSION = '2025-01';

function client() {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!domain || !token) {
    throw new Error('Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN');
  }
  return { domain, token };
}

async function shopifyGet(path) {
  const { domain, token } = client();
  const url = `https://${domain}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify ${res.status} on ${path}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

export async function getDispute(disputeId) {
  const data = await shopifyGet(`/shopify_payments/disputes/${disputeId}.json`);
  return data.dispute;
}

export async function getOrder(orderId) {
  const data = await shopifyGet(`/orders/${orderId}.json`);
  return data.order;
}

export async function getCustomer(customerId) {
  if (!customerId) return null;
  const data = await shopifyGet(`/customers/${customerId}.json`);
  return data.customer;
}

export async function getFulfilments(orderId) {
  const data = await shopifyGet(`/orders/${orderId}/fulfillments.json`);
  return data.fulfillments || [];
}

export async function getTransactions(orderId) {
  const data = await shopifyGet(`/orders/${orderId}/transactions.json`);
  return data.transactions || [];
}

export async function fetchDisputeContext(disputeId) {
  const dispute = await getDispute(disputeId);
  const order = await getOrder(dispute.order_id);
  const [customer, fulfilments, transactions] = await Promise.all([
    getCustomer(order.customer?.id),
    getFulfilments(dispute.order_id),
    getTransactions(dispute.order_id),
  ]);
  return { dispute, order, customer, fulfilments, transactions };
}
