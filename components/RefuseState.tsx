'use client';
import { motion, useReducedMotion } from 'motion/react';
import type { QueryMeta } from '@/lib/types';
import styles from './states.module.css';

// The REFUSE state — the product's soul. A calm, neutral non-answer, never an error.
// Uses only `--refuse-*` / neutral tokens: NO red, NO mascot. A single 300ms fade in.
export function RefuseState({ meta, onBroaden, onRephrase }: {
  meta: QueryMeta; onBroaden: (() => void) | null; onRephrase: () => void }) {
  const still = useReducedMotion();
  return (
    <motion.div role="status" className={styles.refuse}
      initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <h2 className={styles.refuseH}>No governing circular found for this case.</h2>
      <p className={styles.refuseSub}>RailCite won’t guess. Do not rely on this as an answer.</p>
      <p className={`${styles.refuseMeta} mono`}>
        Searched {meta.searched.toLocaleString('en-IN')} passages — none met the relevance bar.</p>
      <div className={styles.refuseActions}>
        {onBroaden && <button type="button" className={styles.quietBtn} onClick={onBroaden}>Remove “verified only”</button>}
        <button type="button" className={styles.quietBtn} onClick={onRephrase}>Rephrase the case</button>
      </div>
    </motion.div>
  );
}
