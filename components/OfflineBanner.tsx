'use client';
import { useSyncExternalStore } from 'react';
import { BholuMascot } from './BholuMascot';
import styles from './states.module.css';

// Single source of truth for connectivity. `useSyncExternalStore` keeps React in sync with
// the browser's online/offline events without tearing. Exported so CaseConsole can decide
// whether to fall back to the cached last answer.
function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
const getSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true; // assume online during SSR (no navigator)

export function useOnline() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Fixed top banner shown only while offline. Warm (not red) — this is a caution, not an error.
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" aria-live="polite" className={styles.offline}>
      <BholuMascot variant="offline" size={40} />
      <span className={styles.offlineText}>
        Offline — live retrieval unavailable. Showing your last cited answer.
      </span>
    </div>
  );
}
