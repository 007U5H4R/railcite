'use client';
import type { Language } from '@/lib/i18n';
import styles from './LanguageToggle.module.css';

// Compact, controlled segmented EN | हिं control. Used inline on each output segment (the cited
// response and the drafted note), each with its own value/onChange so the two translate
// independently. Two real <button>s with aria-pressed so it is keyboard-operable and announced
// correctly. `label` names the group for assistive tech (e.g. "Response language") and stays
// English regardless of the current value so the options are announced consistently.
export function LanguageToggle({ value, onChange, label = 'Language' }: {
  value: Language; onChange: (l: Language) => void; label?: string;
}) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <button type="button" className={`${styles.seg} ${value === 'en' ? styles.on : ''}`}
        aria-pressed={value === 'en'} aria-label="Show in English" onClick={() => onChange('en')}>
        EN
      </button>
      <button type="button" className={`${styles.seg} ${value === 'hi' ? styles.on : ''}`}
        aria-pressed={value === 'hi'} aria-label="Show in Hindi" onClick={() => onChange('hi')}>
        हिं
      </button>
    </div>
  );
}
