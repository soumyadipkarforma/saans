import { describe, expect, it } from 'vitest';
import { buildDayPlan } from '../engine/planner';
import type { AirReading, AssistantTurn, Profile } from '../types';
import { allowedNumbers, extractNumbers, guardReply } from './numberGuard';

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
const allowed = allowedNumbers(turn, profile);

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
  it('includes AQI, PM values, ages, distances, durations and small counts', () => {
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
    const set = allowedNumbers(swapped, profile);
    for (const n of [12.3, 38, 1.25, 91]) expect(set.has(n)).toBe(true);
  });
  it('works for an empty turn', () => {
    expect(allowedNumbers({}, { household: [], activities: [] }).has(5)).toBe(true);
  });
});
