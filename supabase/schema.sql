-- Chargeback Supabase schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).

create extension if not exists "pgcrypto";

-- ============================================================================
-- shops
-- ============================================================================
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  shop_domain text unique not null,
  encrypted_access_token text not null,
  scopes text not null default '',
  installed_at timestamptz not null default now(),
  uninstalled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shops_shop_domain_idx on public.shops (shop_domain);

-- ============================================================================
-- disputes
-- ============================================================================
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  shop_domain text not null references public.shops (shop_domain) on delete cascade,
  -- Shopify IDs stored as text. They're 64-bit and now exceed JS Number.MAX_SAFE_INTEGER.
  shopify_dispute_id text not null,
  shopify_order_id text,
  status text not null default 'pending',         -- pending | drafted | submitted | won | lost
  reason text,
  amount text,
  currency text,
  evidence_due_by timestamptz,
  claude_response jsonb,
  claude_usage jsonb,
  raw_dispute jsonb,
  last_topic text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_domain, shopify_dispute_id)
);

create index if not exists disputes_shop_domain_idx on public.disputes (shop_domain);
create index if not exists disputes_status_idx on public.disputes (status);
create index if not exists disputes_evidence_due_by_idx on public.disputes (evidence_due_by);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shops_set_updated_at on public.shops;
create trigger shops_set_updated_at before update on public.shops
  for each row execute function public.set_updated_at();

drop trigger if exists disputes_set_updated_at on public.disputes;
create trigger disputes_set_updated_at before update on public.disputes
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- We access these tables only from server code using the service_role key,
-- which bypasses RLS. Enabling RLS without policies blocks all anon/public
-- key access by default — this is intentional belt-and-braces.
alter table public.shops enable row level security;
alter table public.disputes enable row level security;
