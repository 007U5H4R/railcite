'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { RecentCase } from '@/hooks/useRecentCases';
import { LoadingSkeleton } from './LoadingSkeleton';
import { ErrorState } from './ErrorState';
import historyStyles from './HistoryDrawer.module.css';
import styles from './screens.module.css';

// Shared list-of-cases card for Home's "Recent cases" and Saved (R4d–f). Each row reuses
// HistoryDrawer's exact case-row look — .item/.dot/.dotOk/.dotNo/.q from
// HistoryDrawer.module.css — so history, recent, and saved all read as the same visual
// language; the status dot keeps its aria-label (status is never color-alone). Handles
// all four states itself: loading (LoadingSkeleton), error (ErrorState + retry), empty
// (caller-provided copy), and populated (the list, optionally with a per-row action and
// a trailing hint line).
export function CaseListCard({ cases, loading, error, onRetry, emptyText, hint, renderAction }: {
  cases: RecentCase[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyText: string;
  hint?: string;
  renderAction?: (c: RecentCase) => ReactNode;
}) {
  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message="Couldn’t load your cases." onRetry={onRetry} />;
  if (cases.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <p className={styles.listEmptyText}>{emptyText}</p>
      </div>
    );
  }
  return (
    <div className={styles.listCard}>
      {cases.map(c => (
        <div key={c.id} className={styles.row}>
          <Link href={`/ask?case=${encodeURIComponent(c.id)}`} className={historyStyles.item}>
            <span
              className={`${historyStyles.dot} ${c.status === 'answered' ? historyStyles.dotOk : historyStyles.dotNo}`}
              role="img"
              aria-label={c.status === 'answered' ? 'answered' : 'no rule found'}
            />
            <span className={historyStyles.q}>{c.question}</span>
          </Link>
          {renderAction?.(c)}
        </div>
      ))}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
