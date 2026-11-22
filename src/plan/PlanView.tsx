import { useT } from '../i18n/i18n';
import type { DayPlan } from '../types';
import { AtHomeCard } from './AtHomeCard';
import { DayTimeline } from './DayTimeline';
import { SwapCard } from './SwapCard';
import styles from './PlanView.module.css';

interface Props {
  plan: DayPlan;
}

// Default export so App can load this screen lazily with React.lazy.
export default function PlanView({ plan }: Props) {
  const tr = useT();
  return (
    <section aria-labelledby="plan-heading" className={styles.plan}>
      <h2 id="plan-heading">{tr('plan.title')}</h2>
      {plan.sensitive && <p className={styles.note}>{tr('plan.sensitive')}</p>}
      <section aria-labelledby="routine-heading" className={styles.card}>
        <h3 id="routine-heading">{tr('plan.routine')}</h3>
        <DayTimeline blocks={plan.lowEmissionRoutine} />
      </section>
      <section aria-labelledby="swaps-heading" className={styles.card}>
        <h3 id="swaps-heading">{tr('plan.swaps')}</h3>
        {plan.sustainableSwaps.length === 0 ? (
          <p className={styles.empty}>{tr('plan.noSwaps')}</p>
        ) : (
          plan.sustainableSwaps.map((swap, index) => <SwapCard key={index} swap={swap} />)
        )}
      </section>
      <AtHomeCard tips={plan.indoorAirTips} />
    </section>
  );
}
