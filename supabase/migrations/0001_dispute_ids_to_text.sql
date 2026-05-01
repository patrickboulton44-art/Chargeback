-- Migration: convert shopify_dispute_id and shopify_order_id from bigint to text.
-- Why: Shopify resource IDs are 64-bit and exceed JS Number.MAX_SAFE_INTEGER
-- (2^53 - 1) for some merchants. Standard JSON.parse silently truncates, so we
-- now parse Shopify JSON with json-bigint (storeAsString) and store IDs as text.
--
-- Run this once in the Supabase SQL editor against an existing installation.
-- Safe to run on an empty table; safe to re-run (the alter is idempotent in effect).

alter table public.disputes
  alter column shopify_dispute_id type text using shopify_dispute_id::text;

alter table public.disputes
  alter column shopify_order_id type text using shopify_order_id::text;
