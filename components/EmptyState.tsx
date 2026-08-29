import { BholuMascot } from './BholuMascot';
import styles from './console.module.css';
export const EXAMPLE_CASES = [
  'Consignee requests waiver of demurrage for wagons detained 18 hours beyond free time due to crane breakdown at the siding.',
  'Wharfage applicability on containerized cargo lying in the terminal after free time; consignee cites heavy rains.',
  'Two-point loading detention — does free time count from placement at the first point or the second?',
];
export function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className={styles.emptyCard}>
      <BholuMascot variant="greet" />
      <h1 className={styles.h1}>Cite the rule. Show the lineage. Or say there isn’t one.</h1>
      <p className={styles.sub}>RailCite searches real Indian Railways circulars and manuals,
        answers only with cited passages, and drafts your justification note.</p>
      <div className={styles.examples} aria-label="Example cases">
        {EXAMPLE_CASES.map(t => (
          <button key={t} type="button" className={styles.exampleChip} onClick={() => onPick(t)}>{t}</button>
        ))}
      </div>
    </div>
  );
}
