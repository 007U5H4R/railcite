'use client';
import type { LineageView } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import styles from './LineagePanel.module.css';

// Supersession / amendment lineage for the documents an answer cites (Phase 4b). Renders the
// curated chain from getLineage() as a vertical timeline, newest / still-in-force at the top.
// Legal standing is carried by the shared StatusBadge (icon + color + text — never color alone)
// plus a struck title for superseded docs. The relation between a node and the one below it
// ("amends" / "supersedes") sits on the connector. Deterministic, curated data — this panel can
// only show relationships the corpus actually records.
export function LineagePanel({ lineage }: { lineage: LineageView }) {
  if (!lineage.nodes.length) return null;
  const lastIdx = lineage.nodes.length - 1;

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
                <StatusBadge kind={n.status === 'in_force' ? 'in_force' : 'superseded'} />
                {n.issue_date && <span className={`${styles.date} mono`}>{n.issue_date}</span>}
              </div>
              {n.relation_to_prev && i < lastIdx && (
                <div className={styles.relation}>
                  <p className={styles.relationLabel}>
                    <span aria-hidden="true">↓ </span>{n.relation_to_prev} the document below
                  </p>
                  {n.note && <p className={styles.relationNote}>{n.note}</p>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
