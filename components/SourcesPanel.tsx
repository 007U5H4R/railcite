'use client';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import type { SourceView } from '@/lib/types';
import { SourceCard } from './SourceCard';
import styles from './evidence.module.css';

// Ordered list of every retrieved source. When a citation chip elsewhere sets
// `activeChunkId`, the matching card scrolls into view and pulses (see SourceCard).
export function SourcesPanel({ sources, activeChunkId, onOpen }: {
  sources: SourceView[]; activeChunkId: string | null; onOpen: (s: SourceView) => void;
}) {
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!activeChunkId) return;
    const el = cardRefs.current.get(activeChunkId);
    el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }, [activeChunkId, reduced]);

  return (
    <ol className={styles.sourcesList} aria-label="Sources">
      {sources.map(s => (
        <li key={s.chunk_id}
          ref={el => { if (el) cardRefs.current.set(s.chunk_id, el); else cardRefs.current.delete(s.chunk_id); }}>
          <SourceCard source={s} active={s.chunk_id === activeChunkId} onOpen={onOpen} />
        </li>
      ))}
    </ol>
  );
}
