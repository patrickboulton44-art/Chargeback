// Supabase admin client (service role key, bypasses RLS).
// Server-only. Never expose this client or the key to the browser.

import { createClient } from '@supabase/supabase-js';

let _admin;

export function getAdminClient() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing SUPABASE_URL');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
