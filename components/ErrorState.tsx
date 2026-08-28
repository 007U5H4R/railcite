import styles from './states.module.css';

// The ONLY red surface in the app: a true system error (network / server failure).
// `role="alert"` so it is announced; a solid, persistent "Try again" control.
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className={styles.error}>
      <p className={styles.errorMsg}>{message}</p>
      <button type="button" className={styles.errorBtn} onClick={onRetry}>Try again</button>
    </div>
  );
}
