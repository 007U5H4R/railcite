import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

/** Bearer token straight off the Authorization header, or null. Split out from
 * `getUserFromRequest` (lib/auth.ts) because routes that need a request-scoped client
 * (see `userClient` below) need the raw token itself, not just the verified user id. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization');
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Request-scoped client authenticated AS THE CALLER (anon key + their access token) —
 * so Postgres RLS enforces per-user ownership on user-owned tables (e.g. `cases`) instead
 * of relying on app-level filtering alone (defense-in-depth; see migrations/002_cases.sql).
 * Unlike `adminClient()` (lib/db.ts) this is NOT a singleton: every caller carries a
 * different token, so a fresh client is built per request. SERVER ONLY. */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
