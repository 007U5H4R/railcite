'use client';
import { useCallback, useEffect, useState } from 'react';
import { getAccessToken } from '@/lib/supabase-browser';
import type { CaseSummary } from '@/lib/types';
import type { RecentCase } from './useRecentCases';

// R4d–f: generalized sibling of useRecentCases for the Home and Saved screens. Same
// authed-fetch pattern against GET /api/cases (token via getAccessToken, Bearer header,
// silent empty list when signed out) — useRecentCases itself is left untouched since
// HistoryDrawer already depends on its exact return shape. This adds what the new
// screens need on top: the `?saved=1` filter, a manual `refresh` (for ErrorState's
// retry), and local mutations for Saved's optimistic un-save.
export function useCases(opts: { savedOnly?: boolean } = {}): {
  cases: RecentCase[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  removeLocal: (id: string) => void;
  restoreLocal: (c: RecentCase) => void;
} {
  const { savedOnly = false } = opts;
  const [cases, setCases] = useState<RecentCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        if (!token) { if (!cancelled) setCases([]); return; }       // signed out: nothing to show
        const url = savedOnly ? '/api/cases?saved=1' : '/api/cases';
        const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body: { cases: CaseSummary[] } = await res.json();
        if (cancelled) return;
        setCases(body.cases.map(r => ({ id: r.id, question: r.question, status: r.status, createdAt: r.created_at })));
      } catch {
        if (!cancelled) setError('Failed to load cases');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [savedOnly, tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  const removeLocal = useCallback((id: string) => {
    setCases(prev => prev.filter(c => c.id !== id));
  }, []);
  // Newest-first, matching the API's own ordering — used to roll an optimistic
  // un-save back into place if the PATCH fails.
  const restoreLocal = useCallback((c: RecentCase) => {
    setCases(prev => [...prev, c].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);

  return { cases, loading, error, refresh, removeLocal, restoreLocal };
}
