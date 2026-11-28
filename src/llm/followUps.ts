import { bandFor, BAND_ORDER, computeAqi } from '../engine/aqi';
import { AQI_MAX, DEFAULT_TRIP_KM, MAX_OUTDOOR_BAND, REASONABLE_HOURS } from '../engine/constants';
import { tripCo2Kg } from '../engine/emissions';
import { bestWindow } from '../engine/forecast';
import { round, tripExposureUg } from '../engine/impact';
import { buildDayPlan } from '../engine/planner';
import { t } from '../i18n/i18n';
import { formatHour } from '../plan/copy';
import type { AirReading, AqiBand, DayPlan, Forecast, Lang, Profile } from '../types';

export type FollowUpKind = 'workFromHome' | 'playAt5' | 'explainAqi';

const CHIP_KEYS: Record<FollowUpKind, string> = {
  workFromHome: 'chip.wfh',
  playAt5: 'chip.childPlay',
  explainAqi: 'chip.explain',
};
const KINDS = Object.keys(CHIP_KEYS) as FollowUpKind[];
const LANGS: Lang[] = ['en', 'hi'];
const PLAY_HOUR = 17;

// Chip phrases match in both languages so a language switch never turns one into a search.
// The same questions typed in other words.
const TYPED: [RegExp, FollowUpKind][] = [
  [/work(?:ing)? from home|\bwfh\b|घर से काम/i, 'workFromHome'],
  [/\bplay\b.*\b(?:5|five|evening)\b|खेल.*(?:5|पाँच|शाम)|(?:5|पाँच|शाम).*खेल/i, 'playAt5'],
  [/explain.*aqi|what (?:is|does) (?:the |an )?aqi|aqi mean|एक्यूआई.*(?:क्या|समझा)/i, 'explainAqi'],
];

export function followUpKind(text: string): FollowUpKind | null {
  const chip = KINDS.find((k) => LANGS.some((l) => text === t(CHIP_KEYS[k], {}, l)));
  return chip ?? TYPED.find(([re]) => re.test(text))?.[1] ?? null;
}

export interface FollowUpContext {
  lang: Lang;
  city: string;
  air: AirReading;
  forecast: Forecast | null;
  profile: Profile;
  /** IST wall clock, "YYYY-MM-DDTHH:mm" */
  now: string;
}

const within = (band: AqiBand, limit: AqiBand) =>
  BAND_ORDER.indexOf(band) <= BAND_ORDER.indexOf(limit);

function playAt5(
  c: FollowUpContext,
  say: (k: string, p?: Record<string, string | number>) => string,
) {
  const day = c.now.slice(0, 10);
  const hourNow = Number(c.now.slice(11, 13));
  if (hourNow > PLAY_HOUR) return say('fu.past');
  const pm25 =
    c.forecast?.hours.find((h) => h.time.startsWith(`${day}T${PLAY_HOUR}`))?.pm25 ?? null;
  const aqi = pm25 === null ? null : computeAqi(pm25, null);
  if (!aqi) return say('fu.noForecast');
  const limit = MAX_OUTDOOR_BAND.sensitive;
  const band = say(`band.${bandFor(aqi.aqi)}`);
  if (within(bandFor(aqi.aqi), limit)) return say('fu.playYes', { band });

  const [first, last] = REASONABLE_HOURS;
  const best = c.forecast
    ? bestWindow(c.forecast.hours, {
        fromHour: Math.max(first, hourNow),
        toHour: last + 1,
        lengthH: 1,
        day,
      })
    : null;
  const bestBand = best ? bandFor(computeAqi(best.meanPm25, null)?.aqi ?? AQI_MAX) : null;
  const tail =
    best && bestBand && within(bestBand, limit)
      ? say('fu.playBest', { hour: formatHour(best.startHour), band: say(`band.${bestBand}`) })
      : say('fu.playNone');
  return `${say('fu.playNo', { band })} ${tail}`;
}

function workFromHome(
  c: FollowUpContext,
  say: (k: string, p?: Record<string, string | number>) => string,
) {
  const commutes = c.profile.activities.filter((a) => a.kind === 'commute' && a.mode);
  const first = commutes[0];
  if (!first?.mode) return { reply: say('fu.wfhNone'), plan: undefined };
  let dose = 0;
  let co2 = 0;
  for (const a of commutes) {
    if (!a.mode) continue;
    const km = a.distanceKm ?? DEFAULT_TRIP_KM.commute;
    const group = c.profile.household[a.participants[0] ?? 0]?.group ?? 'adult';
    if (c.air.pm25 !== null) dose += tripExposureUg(km, a.mode, c.air.pm25, group);
    co2 += tripCo2Kg(km, a.mode);
  }
  const mode = say(`mode.${first.mode}`);
  const params = { mode, dose: round(dose, 1), co2: round(co2, 2) };
  const plan: DayPlan = buildDayPlan({
    profile: { ...c.profile, activities: c.profile.activities.filter((a) => a.kind !== 'commute') },
    air: c.air,
    forecast: c.forecast,
    now: c.now,
  });
  return { reply: say(c.air.pm25 === null ? 'fu.wfhCo2' : 'fu.wfh', params), plan };
}

// Answers a follow-up chip from the turn's data and the engine; `plan` replaces the turn's plan when set.
export function answerFollowUp(
  kind: FollowUpKind,
  c: FollowUpContext,
): { reply: string; plan?: DayPlan } {
  const say = (key: string, p: Record<string, string | number> = {}) => t(key, p, c.lang);
  if (kind === 'playAt5') return { reply: playAt5(c, say) };
  if (kind === 'workFromHome') return workFromHome(c, say);
  return {
    reply: say('fu.explain', {
      city: c.city,
      band: say(`band.${c.air.band}`),
      meaning: say(`explain.${c.air.band}`),
      lo: 0,
      hi: AQI_MAX,
      pollutant: say(`pollutant.${c.air.dominantPollutant}`),
    }),
  };
}
