'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let _c: SupabaseClient | null = null;
export function browserClient(): SupabaseClient {
  if (!_c) _c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
  return _c;
}
export async function getAccessToken(): Promise<string | null> {
  const { data } = await browserClient().auth.getSession();
  return data.session?.access_token ?? null;
}
export async function signInWithGoogle(): Promise<void> {
  // Mark that a sign-in was deliberately initiated. OAuth is a full-page redirect, so the fresh
  // session only materializes on the load *after* Google returns — indistinguishable from a plain
  // session restore. AnalyticsInit consumes this flag to fire `signed_in` exactly once per real
  // sign-in and never on a returning visit.
  try { localStorage.setItem('railcite:signin_intent', '1'); } catch { /* storage may be blocked */ }
  await browserClient().auth.signInWithOAuth({ provider: 'google',
    options: { redirectTo: window.location.origin } });
}
