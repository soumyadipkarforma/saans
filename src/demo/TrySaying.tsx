import { useT } from '../i18n/i18n';
import styles from './demo.module.css';

const KEYS = [1, 2, 3, 4, 5, 6].map((n) => `try.${n}`);

// Clicking fills the message box; it never sends.
export function TrySaying({ onPick }: { onPick: (text: string) => void }) {
  const tr = useT();
  return (
    <section aria-labelledby="try-heading" className={styles.block}>
      <h3 id="try-heading">{tr('try.title')}</h3>
      <ul className={styles.list}>
        {KEYS.map((key) => (
          <li key={key}>
            <button type="button" className={styles.button} onClick={() => onPick(tr(key))}>
              {tr(key)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
