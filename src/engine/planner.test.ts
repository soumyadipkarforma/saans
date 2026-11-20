import { describe, expect, it } from 'vitest';
import {
  DayPlanSchema,
  type Activity,
  type AirReading,
  type DayPlan,
  type Forecast,
  type Member,
  type Profile,
} from '../types';
import { bandFor, computeAqi } from './aqi';
import { buildDayPlan } from './planner';

const NOW = '2026-11-20T08:30';
const DAY = '2026-11-20';

function airOf(pm25: number | null): AirReading {
  const aqi = pm25 === null ? { aqi: 0 } : computeAqi(pm25, null);
  return {
    aqi: aqi?.aqi ?? 0,
    band: bandFor(aqi?.aqi ?? 0),
    pm25,
    pm10: null,
    dominantPollutant: 'pm25',
    source: 'CAMS via Open-Meteo',
    stationOrGrid: 'grid',
    observedAt: NOW,
    fetchedAt: NOW,
    isModelled: true,
    isStale: false,
  };
}
const SEVERE = airOf(300);
const GOOD = airOf(20);

function forecastOf(pm: (h: number) => number | null): Forecast {
  return {
    hours: Array.from({ length: 24 }, (_, h) => ({
      time: `${DAY}T${String(h).padStart(2, '0')}:00`,
      pm25: pm(h),
    })),
    source: 'CAMS via Open-Meteo',
    fetchedAt: NOW,
  };
}
// Cleanest air at 13:00, bad everywhere else.
const FC = forecastOf((h) => (h === 13 ? 25 : 200));
const BAD_FC = forecastOf(() => 200);

const adult: Member = { group: 'adult', respiratory: false, pregnant: false };
const child: Member = { group: 'child', age: 8, respiratory: false, pregnant: false };
const asthmaticElder: Member = { group: 'elderly', respiratory: true, pregnant: false };

const commute: Activity = {
  kind: 'commute',
  startHour: 9,
  distanceKm: 12,
  mode: 'petrolCar',
  participants: [0],
  flexible: false,
};
const schoolRun: Activity = {
  kind: 'schoolRun',
  distanceKm: 4,
  mode: 'petrolCar',
  participants: [1],
  flexible: false,
};
const elderWalk: Activity = { kind: 'walk', participants: [2], flexible: true };

const flat = (p: DayPlan) => p.lowEmissionRoutine.flatMap((b) => b.items);

describe('personalisation (same Very Poor reading)', () => {
  const veryPoor = airOf(200);
  const commuterOnly: Profile = { household: [adult], activities: [commute] };
  const family: Profile = {
    household: [adult, child, asthmaticElder],
    activities: [commute, schoolRun, elderWalk],
  };
  const a = buildDayPlan({ profile: commuterOnly, air: veryPoor, forecast: BAD_FC, now: NOW });
  const b = buildDayPlan({ profile: family, air: veryPoor, forecast: BAD_FC, now: NOW });

  it('is a Very Poor reading', () => {
    expect(veryPoor.band).toBe('veryPoor');
  });
  it('commuter-only: masked commute, no indoor-only advice, not sensitive', () => {
    expect(a.sensitive).toBe(false);
    expect(flat(a).map((i) => i.adviceKey)).toEqual(['mask']);
  });
  it('family: sensitive, elder walk moved indoors, both car trips masked', () => {
    expect(b.sensitive).toBe(true);
    const keys = flat(b).map((i) => i.adviceKey);
    expect(keys).toContain('moveIndoors');
    expect(keys.filter((k) => k === 'mask')).toHaveLength(2);
    expect(flat(a).map((i) => i.adviceKey)).not.toContain('moveIndoors');
  });
  it('swaps differ: commuter gets only the commute swap, family also gets the child school run', () => {
    expect(a.sustainableSwaps.map((s) => [s.activityIndex, s.toMode])).toEqual([[0, 'metro']]);
    expect(b.sustainableSwaps.map((s) => [s.activityIndex, s.toMode])).toEqual([
      [0, 'metro'],
      [1, 'metro'],
    ]);
  });
  it('exposure ranking and CO2 ranking diverge: child gets metro, adult gets walk, same trip and air', () => {
    const trip = (m: Member) =>
      buildDayPlan({
        profile: {
          household: [m],
          activities: [
            {
              kind: 'errand',
              distanceKm: 1.5,
              mode: 'petrolCar',
              participants: [0],
              flexible: true,
            },
          ],
        },
        air: airOf(70),
        forecast: null,
        now: NOW,
      }).sustainableSwaps.map((s) => s.toMode);
    expect(trip(child)).toEqual(['metro']);
    expect(trip(adult)).toEqual(['walk']);
  });
  it('validates against DayPlanSchema and has only finite numbers', () => {
    for (const p of [a, b]) {
      expect(DayPlanSchema.safeParse(p).success).toBe(true);
      const nums = [
        ...flat(p).flatMap((i) => Object.values(i.params)),
        ...p.sustainableSwaps.flatMap((s) => Object.values(s.impact)),
      ].filter((v): v is number => typeof v === 'number');
      expect(nums.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('routine', () => {
  const walkOnly: Profile = {
    household: [adult],
    activities: [{ ...elderWalk, participants: [0] }],
  };
  const run = (profile: Profile, air: AirReading, forecast: Forecast | null) =>
    buildDayPlan({ profile, air, forecast, now: NOW });

  it('moves a flexible walk to the forecast best hour', () => {
    const p = run(walkOnly, airOf(110), FC);
    expect(flat(p)).toEqual([
      {
        activityIndex: 0,
        startHour: 13,
        adviceKey: 'goAt',
        reasonKey: 'reason.goAt',
        params: { band: 'good', hour: 13, pm25: 25 },
      },
    ]);
    expect(p.lowEmissionRoutine.map((b) => b.period)).toEqual(['afternoon']);
  });
  it('without a forecast a flexible activity keeps its hour (default 17) and the current band', () => {
    expect(flat(run(walkOnly, GOOD, null))[0]).toMatchObject({ startHour: 17, adviceKey: 'goAt' });
    const kept: Profile = {
      household: [adult],
      activities: [{ ...elderWalk, participants: [0], startHour: 10 }],
    };
    const q = run(kept, SEVERE, null);
    expect(flat(q)[0]).toMatchObject({ startHour: 10, adviceKey: 'moveIndoors' });
    expect(q.lowEmissionRoutine[0]?.period).toBe('morning');
  });
  it('falls back to the kept hour when the forecast has no usable window', () => {
    expect(
      flat(
        run(
          walkOnly,
          GOOD,
          forecastOf(() => null),
        ),
      )[0],
    ).toMatchObject({ startHour: 17 });
  });
  it('a sensitive participant gets the stricter limit', () => {
    const kid: Profile = { household: [child], activities: [{ ...elderWalk, participants: [0] }] };
    const poor = airOf(100);
    expect(flat(run(kid, poor, null))[0]?.adviceKey).toBe('moveIndoors');
    expect(flat(run(walkOnly, poor, null))[0]?.adviceKey).toBe('goAt');
    expect(flat(run(kid, airOf(70), null))[0]?.adviceKey).toBe('goAt');
  });
  it('fixed activities default to 9 (commute) and 8 (school run); goAhead when air is fine', () => {
    const p: Profile = {
      household: [adult],
      activities: [
        { kind: 'commute', participants: [0], flexible: false },
        { kind: 'schoolRun', participants: [0], flexible: false },
      ],
    };
    expect(flat(run(p, GOOD, null)).map((i) => [i.startHour, i.adviceKey])).toEqual([
      [8, 'goAhead'],
      [9, 'goAhead'],
    ]);
  });
  it('omits pm25 from params when the reading has none', () => {
    expect(flat(run(walkOnly, airOf(null), null))[0]?.params).toEqual({ band: 'good', hour: 17 });
  });
  it('one stayIndoorsUntil per household, at the best hour, only when air exceeds the sensitive limit', () => {
    const profile: Profile = { household: [adult, child, asthmaticElder], activities: [] };
    const p = run(profile, SEVERE, FC);
    expect(flat(p)).toHaveLength(1);
    expect(flat(p)[0]).toMatchObject({
      activityIndex: null,
      startHour: 13,
      adviceKey: 'stayIndoorsUntil',
      params: { hour: 13 },
    });
    expect(flat(run(profile, GOOD, FC))).toEqual([]);
  });
  it('stayIndoorsUntil says "later" and uses the current hour without a forecast', () => {
    const p = run({ household: [child], activities: [] }, SEVERE, null);
    expect(flat(p)[0]).toMatchObject({ startHour: 8, params: { hour: 'later' } });
  });
  it('ignores bad participant indexes; no activities does not crash', () => {
    const odd: Profile = { household: [adult], activities: [{ ...commute, participants: [5] }] };
    expect(run(odd, SEVERE, null).sensitive).toBe(false);
    const empty = run({ household: [], activities: [] }, SEVERE, null);
    expect(empty.lowEmissionRoutine).toEqual([]);
    expect(empty.sustainableSwaps).toEqual([]);
    expect(empty.indoorAirTips.map((t) => t.key)).toContain('exhaustCooking');
  });
});

describe('swaps', () => {
  const errand: Activity = {
    kind: 'errand',
    distanceKm: 1.5,
    mode: 'petrolCar',
    participants: [0],
    flexible: true,
  };
  const prof: Profile = { household: [adult], activities: [errand] };
  const swapsOf = (air: AirReading, p = prof) =>
    buildDayPlan({ profile: p, air, forecast: null, now: NOW }).sustainableSwaps;

  it('Good air allows a walk swap for a 1.5 km car errand; Severe does not', () => {
    expect(swapsOf(GOOD).map((s) => s.toMode)).toEqual(['walk']);
    expect(swapsOf(GOOD)[0]?.whyKey).toBe('swap.walk');
    const severe = swapsOf(SEVERE).map((s) => s.toMode);
    expect(severe).not.toContain('walk');
    expect(severe).not.toContain('cycle');
  });
  it('uses the default trip distance when none is given', () => {
    const noKm: Profile = {
      household: [adult],
      activities: [{ ...errand, distanceKm: undefined }],
    };
    expect(swapsOf(GOOD, noKm).map((s) => s.toMode)).toEqual(['metro']);
  });
  it('only polluting modes are swapped; carpool is for cars only', () => {
    expect(swapsOf(GOOD, { household: [adult], activities: [{ ...errand, mode: 'bus' }] })).toEqual(
      [],
    );
    expect(
      swapsOf(GOOD, { household: [adult], activities: [{ ...errand, mode: undefined }] }),
    ).toEqual([]);
    const bike: Profile = {
      household: [adult],
      activities: [{ ...errand, mode: 'twoWheeler', distanceKm: 10 }],
    };
    expect(swapsOf(airOf(100), bike).map((s) => s.toMode)).toEqual(['metro']);
  });
  it('returns nothing when there is no PM2.5 reading', () => {
    expect(swapsOf(airOf(null))).toEqual([]);
  });
  it('drops a swap that saves no CO2 (zero-distance trip)', () => {
    const play: Profile = {
      household: [adult],
      activities: [{ kind: 'play', mode: 'petrolCar', participants: [0], flexible: true }],
    };
    expect(swapsOf(GOOD, play)).toEqual([]);
  });
  it('keeps at most the top 3 swaps overall, best first', () => {
    const many: Profile = {
      household: [adult],
      activities: [1, 2, 3, 4].map((km) => ({ ...errand, distanceKm: km * 5 })),
    };
    expect(swapsOf(GOOD, many).map((x) => x.activityIndex)).toEqual([3, 2, 1]);
  });
  it('never offers a swap that raises exposure in poor air', () => {
    const s = swapsOf(SEVERE, {
      household: [child],
      activities: [{ ...commute, participants: [0] }],
    });
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.impact.exposureSavedUg >= 0)).toBe(true);
  });
  it('uses the most sensitive group (child, then elderly, then adult) for impact', () => {
    const exposure = (m: Member[]) =>
      swapsOf(airOf(100), {
        household: m,
        activities: [{ ...commute, participants: m.map((_, i) => i) }],
      })[0]?.impact.exposureSavedUg;
    const childOnly = exposure([child]);
    expect(exposure([adult, child])).toBe(childOnly);
    expect(exposure([child, asthmaticElder])).toBe(childOnly);
    expect(exposure([asthmaticElder, adult])).toBe(exposure([asthmaticElder]));
    expect(childOnly).not.toBe(exposure([adult]));
  });
});

describe('remaining hours today', () => {
  const walker: Profile = { household: [adult], activities: [{ ...elderWalk, participants: [0] }] };
  const kid: Profile = { household: [child], activities: [] };
  const at = (profile: Profile, hhmm: string, air: AirReading) =>
    buildDayPlan({ profile, air, forecast: FC, now: `${DAY}T${hhmm}` });

  it('never recommends an hour that has already passed (16:00 walk is not sent to 13:00)', () => {
    const item = flat(at(walker, '16:00', airOf(110)))[0];
    expect(item?.startHour).toBeGreaterThanOrEqual(16);
    expect(item?.params.hour).toBe(item?.startHour);
    const stay = flat(at(kid, '16:00', SEVERE))[0];
    expect(stay).toMatchObject({ adviceKey: 'stayIndoorsUntil', startHour: 16 });
  });
  it('uses a window that starts in the current hour (13:10 -> 13)', () => {
    expect(flat(at(walker, '13:10', airOf(110)))[0]).toMatchObject({
      startHour: 13,
      adviceKey: 'goAt',
    });
  });
  it('no window left at 21:30: skipToday / lateInDay in the evening block', () => {
    const p = at(walker, '21:30', airOf(200));
    expect(flat(p)).toEqual([
      {
        activityIndex: 0,
        startHour: 21,
        adviceKey: 'skipToday',
        reasonKey: 'lateInDay',
        params: { hour: 21 },
      },
    ]);
    expect(p.lowEmissionRoutine.map((b) => b.period)).toEqual(['evening']);
    expect(flat(at(kid, '21:30', SEVERE))[0]).toMatchObject({
      startHour: 21,
      params: { hour: 'later' },
    });
  });
  it('no forecast: a walk with no startHour is pushed to the current hour (18:00 -> 18)', () => {
    const p = buildDayPlan({ profile: walker, air: GOOD, forecast: null, now: `${DAY}T18:00` });
    expect(flat(p)[0]).toMatchObject({ startHour: 18, adviceKey: 'goAt' });
  });
  it('no forecast: a later startHour is kept (19 at 10:00 -> 19); 22 is skipped', () => {
    const at19: Profile = {
      household: [adult],
      activities: [{ ...elderWalk, participants: [0], startHour: 19 }],
    };
    const early = `${DAY}T10:00`;
    expect(
      flat(buildDayPlan({ profile: at19, air: GOOD, forecast: null, now: early }))[0],
    ).toMatchObject({
      startHour: 19,
      adviceKey: 'goAt',
    });
    const at22: Profile = {
      household: [adult],
      activities: [{ ...elderWalk, participants: [0], startHour: 22 }],
    };
    expect(
      flat(buildDayPlan({ profile: at22, air: GOOD, forecast: null, now: early }))[0]?.adviceKey,
    ).toBe('skipToday');
  });
});
