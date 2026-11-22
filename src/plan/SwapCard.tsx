import { useId, useState } from 'react';
import { useT } from '../i18n/i18n';
import type { Swap } from '../types';
import type { Translate } from './copy';
import styles from './SwapCard.module.css';

interface Props {
  swap: Swap;
  activity: string;
}

// Each phrase is chosen from its own number's sign, so smog and CO2 can move in opposite directions.
function smogPhrase(exposureSavedPct: number, tr: Translate): string {
  if (Math.round(Math.abs(exposureSavedPct)) === 0) return tr('swap.smogSame');
  const pct = String(Math.abs(exposureSavedPct));
  return exposureSavedPct > 0 ? tr('swap.smogLess', { pct }) : tr('swap.smogMore', { pct });
}

function co2Phrase(co2SavedKg: number, tr: Translate): string {
  if (Math.round(Math.abs(co2SavedKg) * 100) === 0) return tr('swap.co2Same');
  const kg = String(Math.abs(co2SavedKg));
  return co2SavedKg > 0 ? tr('swap.co2Saved', { kg }) : tr('swap.co2More', { kg });
}

function capitalise(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function SwapCard({ swap, activity }: Props) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const reasonId = useId();
  const { impact } = swap;

  const headline = capitalise(
    tr('swap.headline', {
      fromMode: tr(`mode.${swap.fromMode}`),
      toMode: tr(`mode.${swap.toMode}`),
      smog: smogPhrase(impact.exposureSavedPct, tr),
      co2: co2Phrase(impact.co2SavedKg, tr),
    }),
  );

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
