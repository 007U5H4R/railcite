import styles from './states.module.css';

// Loading placeholder: three shimmer bars, no spinner. Decorative — the accompanying
// TransparencyLine carries the live status text, so the shimmer is aria-hidden.
// Under prefers-reduced-motion the sweep is dropped (states.module.css), leaving static bars.
export function LoadingSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span className={`${styles.bar} ${styles.bar1}`} />
      <span className={`${styles.bar} ${styles.bar2}`} />
      <span className={`${styles.bar} ${styles.bar3}`} />
    </div>
  );
}
