import { useT } from '../i18n/i18n';
import { minutesSince } from '../time';
import type { AirReading } from '../types';
import styles from './SourceBadge.module.css';

interface Props {
  air: AirReading;
  now: Date;
}

export function SourceBadge({ air, now }: Props) {
  const tr = useT();
  const minutes = minutesSince(air.fetchedAt, now);
  return (
    <ul className={styles.badge}>
      <li className={styles.source}>{air.source}</li>
      <li>{tr('source.modelled')}</li>
      <li>{minutes < 1 ? tr('source.justNow') : tr('source.updated', { min: minutes })}</li>
      {air.isStale && <li className={styles.stale}>{tr('source.stale')}</li>}
    </ul>
  );
}
