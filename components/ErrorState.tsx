import styles from './states.module.css';

// The ONLY red surface in the app: a true system error (network / server / upstream failure).
// `role="alert"` so it is announced; a solid, persistent "Try again" control. `message` is the
// short human headline; the optional `detail` explains what happened and what to do — in the
// product's own words, never a raw status code (those live in the server logs).
export function ErrorState({ message, detail, onRetry }: {
  message: string; detail?: string; onRetry: () => void;
}) {
  return (
    <div role="alert" className={styles.error}>
      <div className={styles.errorText}>
        <p className={styles.errorMsg}>{message}</p>
        {detail && <p className={styles.errorDetail}>{detail}</p>}
      </div>
      <button type="button" className={styles.errorBtn} onClick={onRetry}>Try again</button>
    </div>
  );
}
