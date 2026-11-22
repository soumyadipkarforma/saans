import { useT } from '../i18n/i18n';
import type { Activity, PlanBlock } from '../types';
import { activityName, adviceText, formatHour, reasonText } from './copy';
import styles from './DayTimeline.module.css';

interface Props {
  blocks: PlanBlock[];
  activities: Activity[];
}

export function DayTimeline({ blocks, activities }: Props) {
  const tr = useT();
  const filled = blocks.filter((block) => block.items.length > 0);
  if (filled.length === 0) return <p className={styles.empty}>{tr('plan.noActivities')}</p>;

  return (
    <>
      {filled.map((block) => (
        <section
          key={block.period}
          aria-labelledby={`period-${block.period}`}
          className={styles.period}
        >
          <h4 id={`period-${block.period}`}>{tr(`period.${block.period}`)}</h4>
          <ol className={styles.items}>
            {block.items.map((item, index) => (
              <li key={index} className={styles.item}>
                <span className={styles.time}>{formatHour(item.startHour)}</span>
                <div>
                  <p className={styles.activity}>
                    {activityName(activities, item.activityIndex, tr)}
                  </p>
                  <p className={styles.advice}>{adviceText(item, tr)}</p>
                  <p className={styles.reason}>{reasonText(item, tr)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
