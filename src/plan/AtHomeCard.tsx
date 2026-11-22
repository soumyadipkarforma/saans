import { useT } from '../i18n/i18n';
import type { Tip } from '../types';
import { tipText } from './copy';
import styles from './AtHomeCard.module.css';

interface Props {
  tips: Tip[];
}

export function AtHomeCard({ tips }: Props) {
  const tr = useT();
  return (
    <section aria-labelledby="at-home-heading" className={styles.card}>
      <h3 id="at-home-heading">{tr('plan.atHome')}</h3>
      {tips.length === 0 ? (
        <p className={styles.empty}>{tr('plan.noTips')}</p>
      ) : (
        <ul className={styles.list}>
          {tips.map((tip, index) => (
            <li key={index}>{tipText(tip, tr)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
