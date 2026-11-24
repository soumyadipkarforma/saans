import { describe, expect, it } from 'vitest';
import { buildDayPlan } from '../engine/planner';
import type { AirReading, AssistantTurn, Profile } from '../types';
import { allowedNumbers, extractNumbers, guardReply, readings } from './numberGuard';

const air: AirReading = {
  aqi: 312,
  band: 'veryPoor',
  pm25: 180.4,
  pm10: 260,
  dominantPollutant: 'pm25',
  source: 'CAMS via Open-Meteo',
  stationOrGrid: 'x',
  observedAt: '2026-11-22T02:00:00.000Z',
  fetchedAt: '2026-11-22T02:00:00.000Z',
  isModelled: true,
  isStale: false,
};
const profile: Profile = {
  location: { city: 'Delhi', lat: 28.6, lon: 77.2 },
  household: [{ group: 'child', age: 8, respiratory: false, pregnant: false }],
  activities: [
    {
      kind: 'commute',
      startHour: 9,
      distanceKm: 14,
      durationMin: 35,
      mode: 'petrolCar',
      participants: [0],
      flexible: true,
    },
  ],
};
const plan = buildDayPlan({
  profile,
  air,
  forecast: null,
  now: '2026-11-22T08:00',
});
const turn: Partial<AssistantTurn> = { air, plan };
const allowed = allowedNumbers(turn, [8, 14, 35]); // as if the user wrote them

// A real Gemini reply captured live, for a Pune reading observed 2026-11-24 16:00 IST.
const CAPTURED =
  "Air in Pune is satisfactory, with a CAMS via Open-Meteo modelled estimate from Nov 24, 4:00 PM. It means air is generally acceptable, though sensitive groups like your dad may experience minor concerns; please follow his doctor's advice.";

describe('extractNumbers', () => {
  it('reads ASCII digits, decimals and percents', () => {
    expect(extractNumbers('AQI is 312, PM 12.5 and 38%')).toEqual([312, 12.5, 38]);
  });
  it('reads Devanagari digits', () => {
    expect(extractNumbers('एक्यूआई ३१२')).toEqual([312]);
  });
  it('adds the 24-hour value for 12-hour times', () => {
    expect(extractNumbers('at 5pm')).toEqual(expect.arrayContaining([5, 17]));
    expect(extractNumbers('at 12 am')).toEqual(expect.arrayContaining([0]));
    expect(extractNumbers('at 12pm')).toEqual(expect.arrayContaining([12]));
  });
  it('ignores pollutant names such as PM2.5 and PM10', () => {
    expect(extractNumbers('PM2.5 and PM 10 are fine')).toEqual([]);
  });
});

describe('guardReply', () => {
  it('leaves allowed numbers alone', () => {
    expect(guardReply('AQI is 312', new Set([312]))).toEqual({
      reply: 'AQI is 312',
      guarded: false,
    });
  });
  it('guards a number that no tool produced', () => {
    expect(guardReply('AQI is 999', new Set([312])).guarded).toBe(true);
  });
  it('handles Devanagari digits both ways', () => {
    expect(guardReply('एक्यूआई ३१२', new Set([312])).guarded).toBe(false);
    expect(guardReply('एक्यूआई ९९९', new Set([312])).guarded).toBe(true);
  });
  it('lets a reply with no numbers through', () => {
    expect(guardReply('Stay indoors.', new Set()).guarded).toBe(false);
  });
});

describe('allowedNumbers', () => {
  it('includes AQI, PM values, user-typed numbers and small counts', () => {
    for (const n of [312, 180.4, 180, 260, 8, 14, 35, 1, 10]) expect(allowed.has(n)).toBe(true);
    expect(allowed.has(999)).toBe(false);
  });
  it('includes plan hours in 24-hour and 12-hour form', () => {
    const hour = plan.lowEmissionRoutine.flatMap((b) => b.items)[0]?.startHour;
    expect(hour).toBeDefined();
    expect(allowed.has(hour as number)).toBe(true);
    expect(allowed.has((hour as number) % 12 || 12)).toBe(true);
  });
  it('includes swap impact numbers and forecast values', () => {
    const swapped = {
      ...turn,
      plan: {
        ...plan,
        sustainableSwaps: [
          {
            activityIndex: 0,
            fromMode: 'petrolCar' as const,
            toMode: 'metro' as const,
            whyKey: 'k',
            impact: { exposureSavedUg: 12.3, exposureSavedPct: 38, co2SavedKg: 1.25 },
          },
        ],
      },
      forecast: {
        hours: [{ time: '2026-11-22T10:00', pm25: 90.6 }],
        source: 'CAMS via Open-Meteo' as const,
        fetchedAt: air.fetchedAt,
      },
    };
    const set = allowedNumbers(swapped);
    for (const n of [12.3, 38, 1.25, 91]) expect(set.has(n)).toBe(true);
  });
  it('works for an empty turn', () => {
    expect(allowedNumbers({}).has(5)).toBe(true);
  });
});

describe('number words and fullwidth digits', () => {
  it('reads words for 11 and up, compound and Hindi', () => {
    expect(extractNumbers('AQI is three hundred')).toEqual([300]);
    expect(extractNumbers('twenty-one and one thousand two hundred')).toEqual([21, 1200]);
    expect(extractNumbers('तीन सौ')).toEqual([300]);
    expect(extractNumbers('दो हज़ार पचास')).toEqual([2050]);
    expect(extractNumbers('चालीस')).toEqual([40]);
  });
  it('leaves one to ten alone', () => {
    expect(extractNumbers('one or two kids, ten minutes, तीन लोग')).toEqual([]);
  });
  it('reads fullwidth digits', () => {
    expect(extractNumbers('AQI ９９９')).toEqual([999]);
  });
  it('guards a spelled-out reading', () => {
    expect(guardReply('AQI is three hundred', new Set([312])).guarded).toBe(true);
    expect(guardReply('तीन सौ', new Set([312])).guarded).toBe(true);
    expect(guardReply('one or two hours', new Set([312])).guarded).toBe(false);
  });
});

describe('timestamps and scale facts', () => {
  const pune: AirReading = {
    ...air,
    aqi: 85,
    observedAt: '2026-11-24T16:00:00+05:30',
    fetchedAt: '2026-11-24T16:05:00+05:30',
  };
  it('passes the real captured Gemini sentence', () => {
    const set = allowedNumbers({ air: pune });
    expect(guardReply(CAPTURED, set).guarded).toBe(false);
  });
  it('no longer allows scale facts or band boundaries', () => {
    const set = allowedNumbers({});
    expect(guardReply('Poor is 201 to 300', set).guarded).toBe(true);
    expect(guardReply('a 24-hour mean', set).guarded).toBe(true);
    expect(guardReply('Poor air today, up to ten percent worse', set).guarded).toBe(false);
  });
});

describe('AQI and PM context', () => {
  const real: AirReading = { ...air, aqi: 85, pm25: 41.2, pm10: 90 };
  const turn85 = { air: real };
  const check = (text: string) =>
    guardReply(text, allowedNumbers(turn85), readings(turn85)).guarded;
  it('guards scale facts attached to AQI or a pollutant', () => {
    expect(check('The AQI is 300')).toBe(true);
    expect(check('AQI is 200 now')).toBe(true);
    expect(check('The AQI is 24')).toBe(true);
    expect(check('एक्यूआई ३०० है')).toBe(true);
    expect(check('PM2.5 is 999')).toBe(true);
    expect(check('PM 10 is 300')).toBe(true);
    expect(check('AQI is three hundred')).toBe(true);
  });
  it('accepts the real readings and scale phrases', () => {
    expect(check('AQI 85, satisfactory')).toBe(false);
    expect(check('The AQI of 85 is fine')).toBe(false);
    expect(check('PM2.5 is 41 and PM10 is 90')).toBe(false);
    expect(check('AQI 85, Moderate')).toBe(false);
    expect(check('Moderate air, so sensitive people should take care')).toBe(false);
  });
  it('with no reading in the turn, any number after AQI is guarded', () => {
    expect(guardReply('AQI is 85', allowedNumbers({}), readings({})).guarded).toBe(true);
  });
  it('accepts a forecast PM2.5 value after PM2.5', () => {
    const t = {
      air: real,
      forecast: {
        hours: [{ time: '2026-11-24T18:00', pm25: 60 }],
        source: 'CAMS via Open-Meteo' as const,
        fetchedAt: real.fetchedAt,
      },
    };
    expect(guardReply('PM2.5 near 60 at 6pm', allowedNumbers(t), readings(t)).guarded).toBe(false);
  });
});

describe('markdown and scale-word tricks', () => {
  const real: AirReading = { ...air, aqi: 85 };
  const t85 = { air: real };
  const check = (text: string) => guardReply(text, allowedNumbers(t85), readings(t85)).guarded;
  it('guards a fabricated AQI wrapped in markdown or brackets', () => {
    for (const text of [
      '**AQI** is 300, which is very poor.',
      '(AQI) is 300',
      '_AQI_: 300',
      "Today's AQI level is 300",
      'AQI (CPCB) is 300',
      '`AQI` = 300',
      '**एक्यूआई** ३००',
    ]) {
      expect(check(text), text).toBe(true);
    }
  });
  it('passes the real reading in markdown', () => {
    for (const text of ['**AQI 85**', '**AQI** is 85', 'AQI: 85, Moderate']) {
      expect(check(text), text).toBe(false);
    }
  });
});
