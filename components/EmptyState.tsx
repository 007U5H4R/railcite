import { BholuMascot } from './BholuMascot';
import { EXAMPLE_CASES } from '@/lib/starters';
import styles from './console.module.css';
// Starter prompts live in lib/starters (importable by the deploy gate, scripts/smoke-starters.ts).
export { EXAMPLE_CASES } from '@/lib/starters';
export function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className={styles.emptyCard}>
      <BholuMascot variant="greet" />
      <h1 className={styles.h1}>Cite the rule. Show the lineage. Or say there isn’t one.</h1>
      <p className={styles.sub}>RailCite searches real Indian Railways circulars and manuals,
        answers only with cited passages, and drafts your justification note.</p>
      <div className={styles.examples} role="group" aria-label="Example cases">
        {EXAMPLE_CASES.map(t => (
          <button key={t} type="button" className={styles.exampleChip} onClick={() => onPick(t)}>{t}</button>
        ))}
      </div>
    </div>
  );
}
