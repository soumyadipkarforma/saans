import type { ForecastHour } from '../types';

export interface WindowOpts {
  fromHour: number;
  toHour: number;
  lengthH: number;
  /** YYYY-MM-DD, IST calendar day */
  day: string;
}
export interface Window {
  startHour: number;
  meanPm25: number;
}

// Hours are matched on the "YYYY-MM-DDTHH" text; never parsed as Dates (no offset, host zone must not matter).
function pm25ByHour(hours: ForecastHour[], day: string): Map<number, number> {
  const byHour = new Map<number, number>();
  for (const h of hours) {
    if (h.pm25 !== null && h.time.startsWith(`${day}T`)) {
      byHour.set(Number(h.time.slice(11, 13)), h.pm25);
    }
  }
  return byHour;
}

// A window must start at or after fromHour and end by toHour; any missing/null hour disqualifies it. Earliest wins ties.
function pick(hours: ForecastHour[], o: WindowOpts, better: (a: number, b: number) => boolean) {
  const byHour = pm25ByHour(hours, o.day);
  let best: Window | null = null;
  for (let start = o.fromHour; start + o.lengthH <= o.toHour; start++) {
    let sum = 0;
    let complete = true;
    for (let h = start; h < start + o.lengthH; h++) {
      const v = byHour.get(h);
      if (v === undefined) {
        complete = false;
        break;
      }
      sum += v;
    }
    if (!complete) continue;
    const meanPm25 = sum / o.lengthH;
    if (best === null || better(meanPm25, best.meanPm25)) best = { startHour: start, meanPm25 };
  }
  return best;
}

export function bestWindow(hours: ForecastHour[], opts: WindowOpts): Window | null {
  return pick(hours, opts, (a, b) => a < b);
}

export function worstWindow(hours: ForecastHour[], opts: WindowOpts): Window | null {
  return pick(hours, opts, (a, b) => a > b);
}
