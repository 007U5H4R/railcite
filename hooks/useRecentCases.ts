'use client';
import { useCallback, useEffect, useState } from 'react';
import { getAccessToken } from '@/lib/supabase-browser';
import type { CaseSummary } from '@/lib/types';

// One row of the case-history list shown in the HistoryDrawer (and, from R4, the Saved
// screen). `status` mirrors the query outcome: 'answered' (cited) or 'refused' (no rule).
export interface RecentCase {
  id: string;
  question: string;
  status: 'answered' | 'refused';
  createdAt: string;            // ISO — real `cases.created_at`
}

// R4: fetches GET /api/cases (newest first) and maps rows -> RecentCase. Same return shape
// as the stub it replaces ({ cases, loading, error }), so HistoryDrawer needs no change.
export function useRecentCases(): {
  cases: RecentCase[]; loading: boolean; error: string | null; refresh: () => void;
} {
  const [cases, setCases] = useState<RecentCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Exposed so callers can re-fetch on demand — the HistoryDrawer calls this each time it
  // opens, since the drawer is mounted once in the Shell and would otherwise show the list
  // as it was at app-load (i.e. empty) forever, never reflecting cases added since.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) { setCases([]); return; }                        // signed out: no history to show
      const res = await fetch('/api/cases', { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const body: { cases: CaseSummary[] } = await res.json();
      setCases(body.cases.map(r => ({ id: r.id, question: r.question, status: r.status, createdAt: r.created_at })));
    } catch {
      setError('Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);                 // initial load

  return { cases, loading, error, refresh };
}

// Buckets cases into the drawer's date groups. Kept out of the component so R4's real
// `created_at` values bucket identically without any markup change.
export function groupRecentCases(cases: RecentCase[]): {
  today: RecentCase[]; yesterday: RecentCase[]; previous7: RecentCase[];
} {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const today: RecentCase[] = [], yesterday: RecentCase[] = [], previous7: RecentCase[] = [];
  for (const c of cases) {
    const t = new Date(c.createdAt).getTime();
    if (t >= startOfToday) today.push(c);
    else if (t >= startOfYesterday) yesterday.push(c);
    else previous7.push(c);
  }
  return { today, yesterday, previous7 };
}
