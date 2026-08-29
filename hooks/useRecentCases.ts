'use client';
import { useMemo } from 'react';

// One row of the case-history list shown in the HistoryDrawer (and, from R4, the Saved
// screen). `status` mirrors the query outcome: 'answered' (cited) or 'refused' (no rule).
export interface RecentCase {
  id: string;
  question: string;
  status: 'answered' | 'refused';
  createdAt: string;            // ISO — real `cases.created_at` in R4
}

// R4 SEAM: this stub returns a hardcoded sample synchronously. R4 replaces ONLY the
// hook body with a fetch of `/api/cases` (same return shape: { cases, loading, error }).
// Consumers (HistoryDrawer, Saved) and `groupRecentCases` stay untouched.
export function useRecentCases(): { cases: RecentCase[]; loading: boolean; error: string | null } {
  const cases = useMemo<RecentCase[]>(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const H = 3_600_000, D = 86_400_000;
    const at = (ms: number) => new Date(startOfToday + ms).toISOString();
    return [
      { id: 'c1', question: 'When is demurrage charged on wagons beyond free time?', status: 'answered', createdAt: at(5 * H) },
      { id: 'c2', question: 'Wharfage on consignments not removed within free time', status: 'answered', createdAt: at(1 * H) },
      { id: 'c3', question: 'Free time allowed for unloading covered wagons', status: 'answered', createdAt: at(-3 * H) },
      { id: 'c4', question: 'Refund of overcharge on freight — time limit to claim', status: 'answered', createdAt: at(-8 * H) },
      { id: 'c5', question: 'Can my landlord raise house rent twice a year?', status: 'refused', createdAt: at(-14 * H) },
      { id: 'c6', question: 'Penal charge for mis-declaration of goods description', status: 'answered', createdAt: at(-2 * D - 5 * H) },
      { id: 'c7', question: 'Siding charges for shunting to private sidings', status: 'answered', createdAt: at(-3 * D) },
      { id: 'c8', question: 'Concession fare on privilege pass for dependents', status: 'answered', createdAt: at(-5 * D) },
    ];
  }, []);
  return { cases, loading: false, error: null };
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
