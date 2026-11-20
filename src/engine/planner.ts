import type {
  ActivityKind,
  AirReading,
  AqiBand,
  DayPlan,
  Forecast,
  Member,
  PersonGroup,
  PlanBlock,
  PlanItem,
  Profile,
  Swap,
  TravelMode,
} from '../types';
import { BAND_ORDER, bandAtLeast, bandFor, subIndex } from './aqi';
import {
  DEFAULT_TRIP_KM,
  MASK_FROM_BAND,
  MAX_OUTDOOR_BAND,
  REASONABLE_HOURS,
  type Sensitivity,
} from './constants';
import { bestWindow } from './forecast';
import { computeSwapImpact } from './impact';
import { indoorAirTips } from './indoorAirTips';

type Period = PlanBlock['period'];
type Candidate = Swap['toMode'];

const FLEXIBLE_KINDS: ReadonlySet<ActivityKind> = new Set(['walk', 'play', 'exercise', 'errand']);
const DEFAULT_HOUR: Record<ActivityKind, number> = {
  commute: 9,
  schoolRun: 8,
  walk: 17,
  play: 17,
  exercise: 17,
  errand: 17,
};
const POLLUTING: ReadonlySet<TravelMode> = new Set([
  'petrolCar',
  'dieselCar',
  'cngAuto',
  'twoWheeler',
]);
const CARS: ReadonlySet<TravelMode> = new Set(['petrolCar', 'dieselCar']);
const WALK_CYCLE_MAX_KM = 2;
const MAX_SWAPS = 3;
const GROUP_RANK: Record<PersonGroup, number> = { child: 0, elderly: 1, adult: 2 };

const isSensitive = (m: Member): boolean =>
  m.group === 'child' || m.group === 'elderly' || m.respiratory || m.pregnant;
const exceeds = (band: AqiBand, limit: AqiBand): boolean =>
  BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(limit);
const periodOf = (hour: number): Period =>
  hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

function item(
  activityIndex: number | null,
  startHour: number,
  adviceKey: string,
  band: AqiBand,
  pm25: number | null,
  hour: number | string,
): PlanItem {
  const params: PlanItem['params'] = { band, hour };
  if (pm25 !== null) params.pm25 = Math.round(pm25);
  return { activityIndex, startHour, adviceKey, reasonKey: `reason.${adviceKey}`, params };
}

function routine(
  profile: Profile,
  air: AirReading,
  forecast: Forecast | null,
  day: string,
  nowHour: number,
): PlanBlock[] {
  const items: PlanItem[] = [];
  const [firstHour, toHour] = REASONABLE_HOURS;
  const fromHour = Math.max(firstHour, nowHour); // only bounds the forecast window search; kept flexible hours are clamped below
  const best = forecast ? bestWindow(forecast.hours, { fromHour, toHour, lengthH: 1, day }) : null;

  profile.activities.forEach((a, i) => {
    const members = a.participants.flatMap((p) => profile.household[p] ?? []);
    const limit: Sensitivity = members.some(isSensitive) ? 'sensitive' : 'general';
    if (FLEXIBLE_KINDS.has(a.kind)) {
      const hour = best?.startHour ?? Math.max(a.startHour ?? DEFAULT_HOUR[a.kind], nowHour);
      if (hour >= toHour) {
        // a 1-h activity must end by toHour; nothing sensible is left today
        items.push({
          activityIndex: i,
          startHour: nowHour,
          adviceKey: 'skipToday',
          reasonKey: 'lateInDay',
          params: { hour: nowHour },
        });
        return;
      }
      const pm25 = best?.meanPm25 ?? air.pm25;
      const band = best ? bandFor(subIndex('pm25', best.meanPm25)) : air.band;
      const advice = exceeds(band, MAX_OUTDOOR_BAND[limit]) ? 'moveIndoors' : 'goAt';
      items.push(item(i, hour, advice, band, pm25, hour));
    } else {
      const hour = a.startHour ?? DEFAULT_HOUR[a.kind];
      // a fixed activity keeps its real hour; if that hour has passed the advice is for tomorrow
      const base = bandAtLeast(air.band, MASK_FROM_BAND) ? 'mask' : 'goAhead';
      const advice = hour < nowHour ? `${base}Tomorrow` : base;
      items.push(item(i, hour, advice, air.band, air.pm25, hour));
    }
  });

  const out = new Set(profile.activities.flatMap((a) => a.participants));
  const waiting = profile.household.some((m, i) => isSensitive(m) && !out.has(i));
  if (waiting && exceeds(air.band, MAX_OUTDOOR_BAND.sensitive)) {
    items.push(
      item(
        null,
        best?.startHour ?? nowHour,
        'stayIndoorsUntil',
        air.band,
        air.pm25,
        best?.startHour ?? 'later',
      ),
    );
  }

  return (['morning', 'afternoon', 'evening'] as const)
    .map((period) => ({
      period,
      items: items
        .filter((it) => periodOf(it.startHour) === period)
        .sort((x, y) => x.startHour - y.startHour),
    }))
    .filter((b) => b.items.length > 0);
}

function candidatesFor(from: TravelMode, km: number, band: AqiBand): Candidate[] {
  const list: Candidate[] = ['metro', 'bus'];
  if (CARS.has(from)) list.push('carpool');
  if (km <= WALK_CYCLE_MAX_KM && !bandAtLeast(band, 'poor')) list.push('walk', 'cycle');
  return list;
}

function swapsFor(profile: Profile, air: AirReading): Swap[] {
  if (air.pm25 === null) return [];
  const pm25 = air.pm25;
  const lowBand = !bandAtLeast(air.band, 'poor');
  const best: { swap: Swap; byExposure: boolean }[] = [];

  profile.activities.forEach((a, activityIndex) => {
    if (!a.mode || !POLLUTING.has(a.mode)) return;
    const fromMode = a.mode;
    const members = a.participants.flatMap((p) => profile.household[p] ?? []);
    const byExposure = members.some(isSensitive);
    const group = members.reduce<PersonGroup>(
      (g, m) => (GROUP_RANK[m.group] < GROUP_RANK[g] ? m.group : g),
      'adult',
    );
    const distanceKm = a.distanceKm ?? DEFAULT_TRIP_KM[a.kind];
    const options = candidatesFor(fromMode, distanceKm, air.band)
      .map((toMode) => ({
        activityIndex,
        fromMode,
        toMode,
        impact: computeSwapImpact({ distanceKm, fromMode, toMode, pm25, group }),
        whyKey: `swap.${toMode}`,
      }))
      .filter((s) => s.impact.co2SavedKg > 0 && (s.impact.exposureSavedUg >= 0 || lowBand));
    const key = (s: Swap) => (byExposure ? s.impact.exposureSavedUg : s.impact.co2SavedKg);
    const top = options.reduce<Swap | null>((b, s) => (b && key(b) >= key(s) ? b : s), null);
    if (top) best.push({ swap: top, byExposure });
  });

  const householdSensitive = profile.household.some(isSensitive);
  const score = (s: Swap) => (householdSensitive ? s.impact.exposureSavedUg : s.impact.co2SavedKg);
  return best
    .map((b) => b.swap)
    .sort((x, y) => score(y) - score(x))
    .slice(0, MAX_SWAPS);
}

export function buildDayPlan(input: {
  profile: Profile;
  air: AirReading;
  forecast: Forecast | null;
  now: string;
}): DayPlan {
  const { profile, air, forecast, now } = input;
  const day = now.slice(0, 10);
  const sensitive = profile.household.some(isSensitive);
  return {
    lowEmissionRoutine: routine(profile, air, forecast, day, Number(now.slice(11, 13))),
    sustainableSwaps: swapsFor(profile, air),
    indoorAirTips: indoorAirTips({ air, forecast, day, sensitive }),
    sensitive,
  };
}
