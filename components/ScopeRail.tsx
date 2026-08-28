'use client';
import styles from './console.module.css';
export interface Scope { verifiedOnly: boolean; domain: string | null }
export function ScopeRail({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  return (
    <div className={styles.rail}>
      <p className={styles.railHeading}>Scope</p>
      <label className={styles.railRow}>
        <input type="checkbox" checked={scope.verifiedOnly}
          onChange={e => onChange({ ...scope, verifiedOnly: e.target.checked })} />
        Verified sources only <span className={styles.railNote}>(excludes OCR text)</span>
      </label>
      <label className={styles.railRow}>Domain
        <select value={scope.domain ?? ''} aria-label="Domain"
          onChange={e => onChange({ ...scope, domain: e.target.value || null })}>
          <option value="">All domains</option>
          <option value="goods">Goods</option>
          <option value="coaching">Coaching</option>
        </select>
      </label>
    </div>
  );
}
