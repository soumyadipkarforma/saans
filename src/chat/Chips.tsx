import { useT } from '../i18n/i18n';
import styles from './chat.module.css';

interface Props {
  items: string[];
  onPick: (label: string) => void;
}

export function Chips({ items, onPick }: Props) {
  const tr = useT();
  if (items.length === 0) return null;
  return (
    <ul aria-label={tr('chat.suggestions')} className={styles.chips}>
      {items.map((label) => (
        <li key={label}>
          <button type="button" className={styles.chip} onClick={() => onPick(label)}>
            {label}
          </button>
        </li>
      ))}
    </ul>
  );
}
