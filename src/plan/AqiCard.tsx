import { useT } from '../i18n/i18n';
import type { AirReading } from '../types';
import { SourceBadge } from './SourceBadge';
import styles from './AqiCard.module.css';

export type AirStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

interface Props {
  air: AirReading | null;
  status: AirStatus;
  now: Date;
  city?: string;
}

export function AqiCard({ air, status, now, city }: Props) {
  const tr = useT();
  const title = city ? tr('aqi.titleCity', { city }) : tr('aqi.title');

  let body;
  if (status === 'ready' && air) {
    body = (
      <>
        <p className={styles.reading}>
          <span className={styles.label}>{tr('aqi.index')}</span>
          <span className={styles.number}>{air.aqi}</span>
          <span className={styles.band} data-band={air.band}>
            {tr(`band.${air.band}`)}
          </span>
        </p>
        <p className={styles.muted}>
          {tr('aqi.dominant', { pollutant: tr(`pollutant.${air.dominantPollutant}`) })}
        </p>
        <SourceBadge air={air} now={now} />
      </>
    );
  } else if (status === 'loading') {
    body = <p role="status">{tr('aqi.loading')}</p>;
  } else if (status === 'idle') {
    body = <p className={styles.muted}>{tr('aqi.idle')}</p>;
  } else {
    body = <p>{tr('aqi.unavailable')}</p>;
  }

  return (
    <section aria-labelledby="aqi-heading" className={styles.card}>
      <h2 id="aqi-heading">{title}</h2>
      {body}
    </section>
  );
}
