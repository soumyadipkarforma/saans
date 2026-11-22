import type { Activity, PlanItem, Tip } from '../types';

export type Params = Record<string, string | number>;
export type Translate = (key: string, params?: Params) => string;

const HOUR_PARAMS = new Set(['hour', 'from', 'to']);

export function formatHour(hour: number): string {
  return `${hour}:00`;
}

// Hours become H:00, band names their label, and the word later its phrase.
export function paramText(params: Params, tr: Translate): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [name, paramValue(name, value, tr)]),
  );
}

function paramValue(name: string, value: string | number, tr: Translate): string {
  if (typeof value === 'number') return HOUR_PARAMS.has(name) ? formatHour(value) : String(value);
  if (name === 'band') return tr(`band.${value}`);
  if (HOUR_PARAMS.has(name)) return tr(`word.${value}`);
  return value;
}

// The user's own label wins; household-level items (no activity) read as the whole household.
export function activityName(activities: Activity[], index: number | null, tr: Translate): string {
  const activity = index === null ? undefined : activities[index];
  if (!activity) return tr('activity.household');
  return activity.label ?? tr(`activity.${activity.kind}`);
}

export function adviceText(item: PlanItem, tr: Translate): string {
  return tr(`advice.${item.adviceKey}`, paramText(item.params, tr));
}

export function reasonText(item: PlanItem, tr: Translate): string {
  return tr(item.reasonKey, paramText(item.params, tr));
}

export function tipText(tip: Tip, tr: Translate): string {
  return tr(`tip.${tip.key}`, paramText(tip.params, tr));
}
