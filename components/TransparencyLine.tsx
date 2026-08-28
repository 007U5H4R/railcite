import styles from './console.module.css';
export function TransparencyLine({ text }: { text: string }) {
  return <p role="status" className={styles.transparency}>{text}</p>;
}
