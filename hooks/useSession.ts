'use client';
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase-browser';
export interface SessionUser { id: string; name: string | null; avatarUrl: string | null; email: string | null }
export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const sb = browserClient();
    const map = (u: any): SessionUser | null => u ? { id: u.id,
      name: u.user_metadata?.full_name ?? u.email ?? null,
      avatarUrl: u.user_metadata?.avatar_url ?? null,
      email: u.email ?? null } : null;
    sb.auth.getSession().then(({ data }) => { setUser(map(data.session?.user)); setLoading(false); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setUser(map(s?.user)));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { user, loading, signOut: async () => { await browserClient().auth.signOut(); } };
}
