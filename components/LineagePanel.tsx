'use client';
import { useMemo, useState } from 'react';
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
//
// The panel answers "why THIS rule", not "here is everything we know": documents the answer
// actually cited lead and are marked; the rest of the chain stays one tap away. A flat list of 20+
// identically-weighted rows buried the one supersession that justified the answer among a dozen
// uncited siblings, and pushed the drafted note far down the page.
export function LineagePanel({ lineage, citedDocumentIds = [] }: {
  lineage: LineageView; citedDocumentIds?: string[];
}) {
  const [showAll, setShowAll] = useState(false);
  const cited = useMemo(() => new Set(citedDocumentIds), [citedDocumentIds]);

  const titleOf = (id: string) => {
    const n = lineage.nodes.find(x => x.document_id === id);
    return n ? (n.circular_no ?? n.title) : 'a related document';
  };

  // Lead with what the answer relied on: cited documents, plus anything they point at (the
  // supersession that makes them current) — that is the whole "why this rule" story.
  const primary = useMemo(() => {
    const keep = new Set<string>();
    for (const n of lineage.nodes) {
      if (!cited.has(n.document_id)) continue;
      keep.add(n.document_id);
      n.relations.forEach(r => keep.add(r.target_document_id));
    }
    return keep;
  }, [lineage.nodes, cited]);

  const relevant = primary.size > 0;
  const shown = (relevant && !showAll)
    ? lineage.nodes.filter(n => primary.has(n.document_id))
    : lineage.nodes;
  const hidden = lineage.nodes.length - shown.length;

  if (!lineage.nodes.length) return null;
  const lastIdx = shown.length - 1;

  // The seeded relation note is "<circular_no>: <title>", which repeats the row it points at.
  // Show it only when it actually says something the title doesn't.
  const usefulNote = (note: string | null, targetId: string): string | null => {
    if (!note) return null;
    const target = titleOf(targetId).toLowerCase();
    const cleaned = note.replace(/^[^:]{0,40}:\s*/, '').trim();
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!cleaned || norm(cleaned) === norm(target) || norm(target).includes(norm(cleaned))) return null;
    return cleaned;
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
          <small className={styles.subtext}>
            {relevant && !showAll
              ? 'how the cited sources supersede or amend each other'
              : 'how these sources supersede or amend each other'}
          </small>
        </span>
      </div>

      <ol className={styles.chain}>
        {shown.map((n, i) => (
          <li key={n.document_id} className={styles.node} data-status={n.status}
            data-cited={cited.has(n.document_id) ? 'true' : undefined}>
            <div className={styles.rail} aria-hidden="true">
              <span className={styles.dot} />
              {i < lastIdx && <span className={styles.connector} />}
            </div>
            <div className={styles.body}>
              <div className={styles.docTitle}>
                {n.circular_no ?? n.title}
                {cited.has(n.document_id) && <span className={styles.citedTag}>Cited in this answer</span>}
              </div>
              <div className={styles.metaRow}>
                <StatusBadge kind={n.status} />
                {n.issue_date && <span className={`${styles.date} mono`}>{n.issue_date}</span>}
              </div>
              {n.relations.map((rel, j) => {
                const note = usefulNote(rel.note, rel.target_document_id);
                return (
                  <div key={j} className={styles.relation}>
                    <p className={styles.relationLabel}>
                      <span aria-hidden="true">↓ </span>{rel.kind} <b>{titleOf(rel.target_document_id)}</b>
                    </p>
                    {note && <p className={styles.relationNote}>{note}</p>}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      {relevant && hidden > 0 && !showAll && (
        <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
          Show {hidden} more related {hidden === 1 ? 'document' : 'documents'}
        </button>
      )}
      {showAll && relevant && (
        <button type="button" className={styles.more} onClick={() => setShowAll(false)}>
          Show only what this answer cites
        </button>
      )}
    </aside>
  );
}
