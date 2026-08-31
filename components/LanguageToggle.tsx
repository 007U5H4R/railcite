'use client';
import { t, type Language } from '@/lib/i18n';
import styles from './LanguageToggle.module.css';

// Compact segmented EN | हिं control, rendered beside each output segment (the cited response and
// the drafted note). Both instances drive ONE remembered preference, so flipping either switches
// the whole answered view and the choice survives the next case.
//
// Status lives HERE, at the control that caused it: translation takes seconds, and the pending /
// failed state used to render only at the top of the answer column — so flipping the note's toggle
// near the bottom of a long answer produced ~20 seconds of nothing at all. `busy` marks the group
// aria-busy and shows a quiet progress dot; `onRetry` (set only when the translation failed) puts
// the retry within reach of the same finger.
export function LanguageToggle({ value, onChange, label, busy = false, onRetry = null }: {
  value: Language; onChange: (l: Language) => void; label?: string;
  busy?: boolean; onRetry?: (() => void) | null;
}) {
  // Announce the control in the language currently shown, matching the rest of the segment.
  const groupLabel = label ?? (value === 'hi' ? 'भाषा' : 'Language');
  return (
    <div className={styles.wrap}>
      <div className={styles.group} role="group" aria-label={groupLabel} aria-busy={busy || undefined}>
        <button type="button" className={`${styles.seg} ${value === 'en' ? styles.on : ''}`}
          aria-pressed={value === 'en'} aria-label={t('switchToEnglish', value)} onClick={() => onChange('en')}>
          EN
        </button>
        <button type="button" className={`${styles.seg} ${value === 'hi' ? styles.on : ''}`}
          aria-pressed={value === 'hi'} aria-label={t('switchToHindi', value)} onClick={() => onChange('hi')}>
          हिं
        </button>
      </div>
      {busy && (
        <span className={styles.status} role="status">
          <span className={styles.dot} aria-hidden="true" />
          {t('translating', 'hi')}
        </span>
      )}
      {!busy && onRetry && (
        <span className={styles.status} role="status">
          {t('translateFailed', value)}
          <button type="button" className={styles.retry} onClick={onRetry}>{t('tryAgain', value)}</button>
        </span>
      )}
    </div>
  );
}
