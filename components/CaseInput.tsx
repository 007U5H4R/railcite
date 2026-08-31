'use client';
import styles from './console.module.css';
export function CaseInput({ value, onChange, onSubmit, disabled }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; disabled?: boolean }) {
  const ok = value.trim().length >= 10;
  return (
    <div className={styles.casefield}>
      <div className={styles.caseCol}>
        <span className={styles.caseLabel} aria-hidden="true">Case</span>
        <textarea aria-label="Describe your case" className={styles.textarea} rows={1}
          title="Enter to submit · Shift + Enter for a new line"
          placeholder="Describe the case — e.g. wagons detained beyond free time, consignee requests demurrage waiver…"
          value={value} disabled={disabled}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            // Enter submits; Shift+Enter inserts a newline. Guard IME composition so an
            // Enter that commits a candidate (Hindi/other input methods) never submits.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && ok) {
              e.preventDefault(); onSubmit();
            }
          }} />
      </div>
      <button type="button" className={styles.goBtn} aria-label="Find the rule" disabled={!ok || disabled} onClick={onSubmit}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12h15M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
