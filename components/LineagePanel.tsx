'use client';
import type { LineageView } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import styles from './LineagePanel.module.css';

// Supersession / amendment lineage for the documents an answer cites (Phase 4b). Renders the
// curated graph from getLineage() as a vertical list, newest / still-in-force at the top. Each
// node shows its legal standing via the shared StatusBadge (icon + color + text, never color
// alone) — with a struck title when superseded — and each of its relations names the SPECIFIC
// document it supersedes or amends, plus what changed. Branching (a doc with several relations)
// and multiple disjoint chains both render without dropping anything, and no chain is implied
// that isn't in the data. Curated data only — this can only show relationships the corpus records.
export function LineagePanel({ lineage }: { lineage: LineageView }) {
  if (!lineage.nodes.length) return null;
  const lastIdx = lineage.nodes.length - 1;
  const titleOf = (id: string) => {
    const n = lineage.nodes.find(x => x.document_id === id);
    return n ? (n.circular_no ?? n.title) : 'a related document';
  };

  return (
    <aside className={styles.lineage} aria-label="Document lineage">
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="2.4" /><circle cx="12" cy="19" r="2.4" /><path d="M12 7.4v9.2" />
          </svg>
        </span>
        <span className={styles.headText}>
          Lineage
          <small className={styles.subtext}>how these sources supersede or amend each other</small>
        </span>
      </div>

      <ol className={styles.chain}>
        {lineage.nodes.map((n, i) => (
          <li key={n.document_id} className={styles.node} data-status={n.status}>
            <div className={styles.rail} aria-hidden="true">
              <span className={styles.dot} />
              {i < lastIdx && <span className={styles.connector} />}
            </div>
            <div className={styles.body}>
              <div className={styles.docTitle}>{n.circular_no ?? n.title}</div>
              <div className={styles.metaRow}>
                <StatusBadge kind={n.status} />
                {n.issue_date && <span className={`${styles.date} mono`}>{n.issue_date}</span>}
              </div>
              {n.relations.map((rel, j) => (
                <div key={j} className={styles.relation}>
                  <p className={styles.relationLabel}>
                    <span aria-hidden="true">↓ </span>{rel.kind} <b>{titleOf(rel.target_document_id)}</b>
                  </p>
                  {rel.note && <p className={styles.relationNote}>{rel.note}</p>}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
