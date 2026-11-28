import { BAND_ORDER, bandFor, computeAqi } from '../engine/aqi';
import {
  AQI_MAX,
  BREATHING_RATE_M3_PER_H,
  MASK_FACTORS,
  MASK_FROM_BAND,
  MAX_OUTDOOR_BAND,
  PURIFIER_FROM_BAND,
  REASONABLE_HOURS,
} from '../engine/constants';
import { bestWindow, worstWindow } from '../engine/forecast';
import { round } from '../engine/impact';
import { t } from '../i18n/i18n';
import { formatHour, tipText } from '../plan/copy';
import type { AirReading, AqiBand, DayPlan, Forecast, Lang } from '../types';

export type QuestionKind =
  | 'health'
  | 'thanks'
  | 'mask'
  | 'purifier'
  | 'tomorrow'
  | 'why'
  | 'windows'
  | 'outside'
  | 'airNow'
  | 'help';

// shortcut: keyword intents in English and Hindi; free phrasing beyond these is Gemini's job (with a key).
const ASKING =
  /\?\s*$|^(?:is|are|can|could|should|shall|will|would|do|does|what|why|how|when|where|which|any|tell me|so)\b|^(?:क्या|कब|क्यों|कैसे|कैसा|कैसी)/i;
const ALWAYS: [RegExp, QuestionKind][] = [
  [
    /\bcough|breathless|can'?t breathe|chest|wheez|\beyes? (?:burn|itch|water)|symptom|खाँसी|खांसी|सीने|आँखों में जलन/i,
    'health',
  ],
  [/^(?:thanks|thank you|thx|ty|great|cool|ok thanks)\b|धन्यवाद|शुक्रिया/i, 'thanks'],
  [/\bmask|n95|मास्क/i, 'mask'],
  [/purifier|air filter|hepa|प्यूरीफायर/i, 'purifier'],
];
const ASKED: [RegExp, QuestionKind][] = [
  [/tomorrow|\bकल\b/i, 'tomorrow'],
  [/\bwhy\b|cause|reason|क्यों|वजह/i, 'why'],
  [/window|ventilat|fresh air|खिड़की/i, 'windows'],
  [
    /safe|go (?:out|outside)|step out|outdoor|\brun\b|\bjog|exercise|workout|walk|cycle|play|बाहर|सुरक्षित|दौड़|टहल/i,
    'outside',
  ],
  [/air|aqi|pollution|smog|हवा|प्रदूषण/i, 'airNow'],
  [/help|what can you|who are you|मदद/i, 'help'],
];

export function questionKind(text: string): QuestionKind | null {
  const always = ALWAYS.find(([re]) => re.test(text))?.[1];
  if (always) return always;
  if (!ASKING.test(text.trim())) return null;
  return ASKED.find(([re]) => re.test(text))?.[1] ?? null;
}

export interface QuestionContext {
  lang: Lang;
  city: string;
  air: AirReading;
  forecast: Forecast | null;
  plan: DayPlan;
  text: string;
  /** IST wall clock, "YYYY-MM-DDTHH:mm" */
  now: string;
}

const atLeast = (band: AqiBand, from: AqiBand) =>
  BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(from);
const within = (band: AqiBand, limit: AqiBand) =>
  BAND_ORDER.indexOf(band) <= BAND_ORDER.indexOf(limit);
const hourBand = (pm25: number) => bandFor(computeAqi(pm25, null)?.aqi ?? AQI_MAX);
const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

// Every number here comes from the reading, the forecast, the plan or engine constants; words from i18n.
export function answerQuestion(kind: QuestionKind, c: QuestionContext): string {
  const say = (key: string, p: Record<string, string | number> = {}) => t(key, p, c.lang);
  const band = say(`band.${c.air.band}`);
  const day = c.now.slice(0, 10);
  const hourNow = Number(c.now.slice(11, 13));
  const [first, last] = REASONABLE_HOURS;

  switch (kind) {
    case 'health':
      return say('q.health');
    case 'thanks':
      return say('q.thanks');
    case 'help':
      return say('q.help');
    case 'why':
      return say('q.why', { pollutant: say(`pollutant.${c.air.dominantPollutant}`), band });
    case 'mask': {
      if (atLeast(c.air.band, MASK_FROM_BAND)) {
        return say('q.maskYes', { band, cut: round((1 - MASK_FACTORS.n95) * 100, 0) });
      }
      return say(atLeast(c.air.band, 'moderate') ? 'q.maskSensitive' : 'q.maskNo', { band });
    }
    case 'purifier':
      return say(atLeast(c.air.band, PURIFIER_FROM_BAND) ? 'q.purifierYes' : 'q.purifierMaybe', {
        band,
      });
    case 'windows': {
      const tips = c.plan.indoorAirTips.filter(
        (x) => x.key === 'airOut' || x.key === 'windowsShut',
      );
      return tips.length > 0 ? tips.map((x) => tipText(x, say)).join(' ') : say('q.windowsNone');
    }
    case 'airNow':
      return say('q.airNow', { city: c.city, band, aqi: c.air.aqi });
    case 'tomorrow': {
      const opts = { fromHour: first, toHour: last + 1, lengthH: 1, day: nextDay(day) };
      const best = c.forecast ? bestWindow(c.forecast.hours, opts) : null;
      const worst = c.forecast ? worstWindow(c.forecast.hours, opts) : null;
      if (!best || !worst) return say('q.noForecast');
      return say('q.tomorrow', {
        best: formatHour(best.startHour),
        bestBand: say(`band.${hourBand(best.meanPm25)}`),
        worst: formatHour(worst.startHour),
        worstBand: say(`band.${hourBand(worst.meanPm25)}`),
      });
    }
    case 'outside': {
      const limit = MAX_OUTDOOR_BAND[c.plan.sensitive ? 'sensitive' : 'general'];
      const hard = /\brun\b|jog|exercise|workout|gym|दौड़/i.test(c.text);
      const ratio = round(
        BREATHING_RATE_M3_PER_H.adult.moderate / BREATHING_RATE_M3_PER_H.adult.light,
        1,
      );
      const note = hard ? ` ${say('q.exerciseNote', { ratio })}` : '';
      if (within(c.air.band, limit)) {
        return `${say('q.outsideYes', { band })}${note}`;
      }
      const best =
        c.forecast && hourNow < last
          ? bestWindow(c.forecast.hours, {
              fromHour: Math.max(first, hourNow + 1),
              toHour: last + 1,
              lengthH: 1,
              day,
            })
          : null;
      const bestBand = best ? hourBand(best.meanPm25) : null;
      if (best && bestBand && within(bestBand, limit)) {
        return `${say('q.outsideLater', { band, hour: formatHour(best.startHour), bestBand: say(`band.${bestBand}`) })}${note}`;
      }
      return `${say('q.outsideNo', { band })}${note}`;
    }
  }
}
