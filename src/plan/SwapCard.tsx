import { useId, useState } from 'react';
import { useT } from '../i18n/i18n';
import type { Swap } from '../types';
import { swapHeadline } from './copy';
import styles from './SwapCard.module.css';

interface Props {
  swap: Swap;
  activity: string;
}

export function SwapCard({ swap, activity }: Props) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const reasonId = useId();

  const headline = swapHeadline(swap, tr);

  return (
    <article className={styles.card}>
      <p className={styles.activity}>{activity}</p>
      <p className={styles.headline}>{headline}</p>
      <button
        type="button"
        className={styles.why}
        aria-expanded={open}
        aria-controls={reasonId}
        onClick={() => setOpen((value) => !value)}
      >
        {tr('swap.whyButton')}
      </button>
      {open && (
        <p id={reasonId} className={styles.reason}>
          {swap.why ?? tr(swap.whyKey)}
        </p>
      )}
    </article>
  );
}
