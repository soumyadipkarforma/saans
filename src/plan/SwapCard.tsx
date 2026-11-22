import { useId, useState } from 'react';
import { useT } from '../i18n/i18n';
import type { Swap } from '../types';
import styles from './SwapCard.module.css';

interface Props {
  swap: Swap;
}

export function SwapCard({ swap }: Props) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const reasonId = useId();
  const { impact } = swap;

  const params = {
    fromMode: tr(`mode.${swap.fromMode}`),
    toMode: tr(`mode.${swap.toMode}`),
    pct: Math.round(Math.abs(impact.exposureSavedPct)),
    kg: Math.abs(impact.co2SavedKg).toFixed(1),
  };
  // Less smog inhaled but more CO2 is a trade-off; say which way each number moves.
  const headline =
    impact.exposureSavedPct < 0 ? tr('swap.tradeoff', params) : tr('swap.headline', params);

  return (
    <article className={styles.card}>
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
