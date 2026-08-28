import styles from './Shell.module.css';
import { TopBar } from './TopBar';
import { TrustFooter } from './TrustFooter';

export function Shell({ rail, evidence, accountSlot, children }: {
  rail?: React.ReactNode; evidence?: React.ReactNode;
  accountSlot?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <TopBar accountSlot={accountSlot} />
      <div className={styles.zones}>
        <nav aria-label="Scope" className={styles.rail}>{rail}</nav>
        <main className={styles.center}>{children}</main>
        <aside aria-label="Evidence" role="complementary" className={styles.evidence}>{evidence}</aside>
      </div>
      <TrustFooter />
    </div>
  );
}
