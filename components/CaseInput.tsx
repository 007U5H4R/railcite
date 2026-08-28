'use client';
import styles from './console.module.css';
export function CaseInput({ value, onChange, onSubmit, disabled }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; disabled?: boolean }) {
  const ok = value.trim().length >= 10;
  return (
    <div className={styles.inputWrap}>
      <textarea aria-label="Describe your case" className={styles.textarea} rows={4}
        placeholder="Describe the case — e.g. wagons detained beyond free time, consignee requests demurrage waiver…"
        value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ok) { e.preventDefault(); onSubmit(); } }} />
      <div className={styles.inputBar}>
        <span className={styles.hint}>⌘↵ to submit</span>
        <button type="button" className={styles.primaryBtn} disabled={!ok || disabled} onClick={onSubmit}>
          Find the rule
        </button>
      </div>
    </div>
  );
}
