import { BholuMascot } from './BholuMascot';
import styles from './console.module.css';
// Starter prompts shown on the empty Ask screen. Deliberately chosen to land on the verified
// corpus verticals (demurrage/wharfage/waiver, weighment/punitive, CRT hub-and-spoke) so a
// first-time tap returns a real cited answer, never a refuse.
export const EXAMPLE_CASES = [
  'Consignee requests waiver of demurrage for wagons detained 18 hours beyond free time due to a crane breakdown at the siding — is it admissible and who can sanction it?',
  'What is the wharfage applicability on containerised cargo lying in the terminal beyond free time when the consignee cites heavy rains?',
  'Which authority can sanction a demurrage or wharfage waiver, and up to what monetary limit?',
  'When is weighment of a wagon-load dispensed with, and how is a punitive charge for overloading assessed?',
  'What is the current haulage rate for bulk cement moved by container rakes (CRT), and which corrigendum governs it?',
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
