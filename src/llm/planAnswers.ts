import { t } from '../i18n/i18n';
import { activityName, adviceText, formatHour, swapHeadline, tipText } from '../plan/copy';
import type { ActivityKind, DayPlan, Lang, PlanItem, Profile } from '../types';

export type PlanIntent = 'today' | 'swap' | 'bestTime';

// shortcut: keyword matching in en and hi for the demo-style questions; Gemini handles free phrasing.
const TODAY = /today look|आज का दिन|दिन कैसा/i;
const SWAP = /swap.*\b(?:most|best)\b|\bbest swap\b|(?:स्वैप|बदलाव).*सबसे|सबसे.*(?:स्वैप|बदलाव)/i;
const BEST_TIME =
  /\b(?:best time|when (?:is|should|can))\b.*\b(?:walk|jog|run|play|exercise|stroll)|(?:कब|समय).*(?:टहल|सैर|जॉग|दौड़|खेल)|(?:टहल|सैर|जॉग|दौड़|खेल).*(?:कब|समय)/i;

export function planIntent(text: string): PlanIntent | null {
  if (SWAP.test(text)) return 'swap';
  if (BEST_TIME.test(text)) return 'bestTime';
  return TODAY.test(text) ? 'today' : null;
}

const KIND_WORDS: [RegExp, ActivityKind][] = [
  [/walk|stroll|टहल|सैर/i, 'walk'],
  [/jog|run|exercise|जॉग|दौड़/i, 'exercise'],
  [/play|खेल/i, 'play'],
];
const OUTDOOR: ReadonlySet<ActivityKind> = new Set(['walk', 'play', 'exercise']);

// Numbers come only from the plan the engine built this turn; the words come from i18n.
export function answerPlanIntent(
  intent: PlanIntent,
  c: { lang: Lang; plan: DayPlan; profile: Profile; text: string },
): string {
  const { plan, profile, text } = c;
  const say = (key: string, p: Record<string, string | number> = {}) => t(key, p, c.lang);
  const name = (i: number | null) => activityName(profile.activities, i, say);
  const items = plan.lowEmissionRoutine.flatMap((b) => b.items);

  if (intent === 'swap') {
    const swap = plan.sustainableSwaps[0];
    return swap
      ? say('ans.swap', { activity: name(swap.activityIndex), headline: swapHeadline(swap, say) })
      : say('plan.noSwaps');
  }

  if (intent === 'today') {
    const first = plan.lowEmissionRoutine[0]?.items[0];
    if (!first) return say('ans.todayNone');
    const tip = plan.indoorAirTips[0];
    const head = say('ans.today', {
      activity: name(first.activityIndex),
      hour: formatHour(first.startHour),
      advice: adviceText(first, say),
    });
    return tip ? `${head} ${say('ans.todayTip', { tip: tipText(tip, say) })}` : head;
  }

  const kind = KIND_WORDS.find(([re]) => re.test(text))?.[1];
  const kindOf = (it: PlanItem) => profile.activities[it.activityIndex ?? -1]?.kind;
  const outdoors = items.filter((it) => OUTDOOR.has(kindOf(it) as ActivityKind));
  const item = outdoors.find((it) => kindOf(it) === kind) ?? outdoors[0];
  if (!item) return say('ans.noFlexible');
  const params = {
    activity: name(item.activityIndex).toLowerCase(),
    hour: formatHour(item.startHour),
    band: say(`band.${item.params.band}`),
  };
  if (item.adviceKey === 'goAt') return say('ans.bestTime', params);
  return say(item.adviceKey === 'skipToday' ? 'ans.late' : 'ans.noWindow', params);
}
