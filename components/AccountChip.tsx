'use client';
import { useSession } from '@/hooks/useSession';
import { signInWithGoogle } from '@/lib/supabase-browser';
import styles from './auth.module.css';
export function AccountChip() {
  const { user, loading, signOut } = useSession();
  if (loading) return null;
  if (!user) return (
    <button type="button" className={styles.ghostBtn} onClick={() => void signInWithGoogle()}>Sign in</button>);
  return (
    <div className={styles.chip}>
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt="" width={28} height={28} className={styles.avatar} referrerPolicy="no-referrer" />
        : <span aria-hidden className={styles.avatarFallback}>{(user.name ?? '?').slice(0, 1)}</span>}
      <span className={styles.name}>{user.name}</span>
      <button type="button" className={styles.ghostBtn} onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}
