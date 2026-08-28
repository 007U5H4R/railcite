'use client';
import { useState } from 'react';
import type { SourceView, LineageView } from '@/lib/types';
import { SourcesPanel } from './SourcesPanel';
import styles from './evidence.module.css';

type Tab = 'sources' | 'lineage';

// Desktop: fills the Shell `evidence` slot in normal flow. <1024px: this same markup
// becomes a fixed bottom sheet (see evidence.module.css) — collapsed it shows only the
// tab bar as a ~56px handle; tapping a tab expands it to a scrollable ~60dvh sheet.
export function EvidencePanel({ sources, lineage, activeChunkId, onOpen }: {
  sources: SourceView[]; lineage: LineageView | null;
  activeChunkId: string | null; onOpen: (s: SourceView) => void;
}) {
  const [tab, setTab] = useState<Tab>('sources');
  const [expanded, setExpanded] = useState(false);

  const selectTab = (t: Tab) => { setExpanded(prev => (t === tab ? !prev : true)); setTab(t); };

  return (
    <div className={`${styles.evidencePanel} ${expanded ? styles.expanded : ''}`}>
      <div role="tablist" aria-label="Evidence" className={styles.tabBar}>
        <button type="button" role="tab" id="evidence-tab-sources" aria-selected={tab === 'sources'}
          aria-controls="evidence-panel-sources" className={styles.tab} onClick={() => selectTab('sources')}>
          Sources
        </button>
        <button type="button" role="tab" id="evidence-tab-lineage" aria-selected={tab === 'lineage'}
          aria-controls="evidence-panel-lineage" className={styles.tab} onClick={() => selectTab('lineage')}>
          Lineage
        </button>
      </div>
      <div className={styles.evidenceBody}>
        {tab === 'sources' && (
          <div role="tabpanel" id="evidence-panel-sources" aria-labelledby="evidence-tab-sources">
            <SourcesPanel sources={sources} activeChunkId={activeChunkId} onOpen={onOpen} />
          </div>
        )}
        {tab === 'lineage' && (
          <div role="tabpanel" id="evidence-panel-lineage" aria-labelledby="evidence-tab-lineage">
            <p className={styles.lineagePlaceholder}>TODO(T23)</p>
          </div>
        )}
      </div>
    </div>
  );
}
