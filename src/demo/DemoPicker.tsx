import { useT } from '../i18n/i18n';
import styles from './demo.module.css';
import { DEMO_FAMILIES, type DemoFamily } from './families';

interface Props {
  onPick: (family: DemoFamily) => void;
  disabled: boolean;
}

export function DemoPicker({ onPick, disabled }: Props) {
  const tr = useT();
  return (
    <section aria-labelledby="demo-heading" className={styles.block}>
      <h3 id="demo-heading">{tr('demo.title')}</h3>
      <ul className={styles.list}>
        {DEMO_FAMILIES.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              disabled={disabled}
              className={styles.button}
              onClick={() => onPick(f)}
            >
              {tr(`demo.${f.id}`)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
