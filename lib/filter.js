// Trim raw Shopify payloads to the fields Claude actually needs.
// Reduces token cost and keeps the model focused on what matters.

export function filterDispute(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    order_id: raw.order_id,
    type: raw.type,
    reason: raw.reason,
    network_reason_code: raw.network_reason_code,
    status: raw.status,
    amount: raw.amount,
    currency: raw.currency,
    initiated_at: raw.initiated_at,
    evidence_due_by: raw.evidence_due_by,
    evidence_sent_on: raw.evidence_sent_on,
    finalized_on: raw.finalized_on,
  };
}

export function filterOrder(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name,
    created_at: raw.created_at,
    processed_at: raw.processed_at,
    total_price: raw.total_price,
    currency: raw.currency,
    financial_status: raw.financial_status,
    fulfillment_status: raw.fulfillment_status,
    customer_id: raw.customer?.id,
    browser_ip: raw.browser_ip,
    line_items: (raw.line_items || []).map((li) => ({
      name: li.name,
      quantity: li.quantity,
      price: li.price,
      sku: li.sku,
      variant_title: li.variant_title,
    })),
    shipping_address: raw.shipping_address && {
      name: raw.shipping_address.name,
      address1: raw.shipping_address.address1,
      address2: raw.shipping_address.address2,
      city: raw.shipping_address.city,
      province: raw.shipping_address.province,
      zip: raw.shipping_address.zip,
      country: raw.shipping_address.country,
    },
    billing_address: raw.billing_address && {
      name: raw.billing_address.name,
      address1: raw.billing_address.address1,
      address2: raw.billing_address.address2,
      city: raw.billing_address.city,
      province: raw.billing_address.province,
      zip: raw.billing_address.zip,
      country: raw.billing_address.country,
    },
  };
}

export function filterCustomer(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    email: raw.email,
    created_at: raw.created_at,
    orders_count: raw.orders_count,
    total_spent: raw.total_spent,
    verified_email: raw.verified_email,
    state: raw.state,
  };
}

export function filterFulfilments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((f) => ({
    id: f.id,
    status: f.status,
    created_at: f.created_at,
    updated_at: f.updated_at,
    shipment_status: f.shipment_status,
    tracking_company: f.tracking_company,
    tracking_number: f.tracking_number,
    tracking_url: f.tracking_url,
  }));
}

export function filterTransactions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => ({
    id: t.id,
    kind: t.kind,
    status: t.status,
    gateway: t.gateway,
    created_at: t.created_at,
    amount: t.amount,
    currency: t.currency,
    payment_details: t.payment_details && {
      avs_result_code: t.payment_details.avs_result_code,
      cvv_result_code: t.payment_details.cvv_result_code,
      credit_card_bin: t.payment_details.credit_card_bin,
      credit_card_company: t.payment_details.credit_card_company,
      credit_card_number: t.payment_details.credit_card_number, // already masked by Shopify
    },
  }));
}
