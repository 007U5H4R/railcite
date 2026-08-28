import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';
let _admin: SupabaseClient | null = null;
/** Service-role client. SERVER/SCRIPTS ONLY — never import from client components. */
export function adminClient(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _admin;
}
