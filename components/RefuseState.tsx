'use client';
import { motion, useReducedMotion } from 'motion/react';
import type { QueryMeta } from '@/lib/types';
import { t, searchedPassages, type Language } from '@/lib/i18n';
import styles from './states.module.css';

// The REFUSE state — the product's soul. A calm, neutral non-answer, never an error.
// White card + a neutral slate icon circle (never red, no mascot). A single 300ms fade in.
export function RefuseState({ meta, onBroaden, onRephrase, lang = 'en' }: {
  meta: QueryMeta; onBroaden: (() => void) | null; onRephrase: () => void; lang?: Language }) {
  const still = useReducedMotion();
  return (
    <motion.div role="status" className={styles.refuse}
      initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <span className={styles.refuseIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
      </span>
      <h2 className={styles.refuseH}>{t('refuseTitle', lang)}</h2>
      <p className={styles.refuseSub}>{t('refuseSub', lang)}</p>
      <p className={`${styles.refuseMeta} mono`}>{searchedPassages(meta.searched, lang)}</p>
      <div className={styles.refuseActions}>
        {onBroaden && <button type="button" className={styles.quietBtn} onClick={onBroaden}>{t('removeVerifiedOnly', lang)}</button>}
        <button type="button" className={styles.quietBtn} onClick={onRephrase}>{t('rephrase', lang)}</button>
      </div>
    </motion.div>
  );
}
