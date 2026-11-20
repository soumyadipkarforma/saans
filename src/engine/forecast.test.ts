// TZ=UTC comes from vitest config test.env; the first test proves it is in effect.
import { describe, expect, it } from 'vitest';
import type { ForecastHour } from '../types';
import { bestWindow, worstWindow } from './forecast';
import { indoorAirTips } from './indoorAirTips';

const DAY = '2026-11-20';
const hh = (h: number) => String(h).padStart(2, '0');
function hoursOf(pm: (h: number) => number | null, day = DAY): ForecastHour[] {
  return Array.from({ length: 24 }, (_, h) => ({ time: `${day}T${hh(h)}:00`, pm25: pm(h) }));
}
const opts = { fromHour: 10, toHour: 18, lengthH: 2, day: DAY };

describe('timezone', () => {
  it('runs with TZ=UTC', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(0);
  });
});

describe('bestWindow / worstWindow', () => {
  it('finds the lowest-PM window', () => {
    const hours = hoursOf((h) => (h === 14 || h === 15 ? 20 : 100));
    expect(bestWindow(hours, opts)).toEqual({ startHour: 14, meanPm25: 20 });
  });
  it('finds the highest-PM window', () => {
    const hours = hoursOf((h) => (h === 12 || h === 13 ? 300 : 100));
    expect(worstWindow(hours, opts)).toEqual({ startHour: 12, meanPm25: 300 });
  });
  it('ignores hours outside the range and windows ending after toHour', () => {
    const hours = hoursOf((h) => (h === 8 || h === 18 || h === 19 ? 1 : 100));
    expect(bestWindow(hours, opts)?.meanPm25).toBe(100);
    // last allowed 2-h window starts at 16 (ends 18)
    const late = hoursOf((h) => (h === 17 ? 1 : 100));
    expect(bestWindow(late, opts)).toEqual({ startHour: 16, meanPm25: 50.5 });
  });
  it('skips windows touching a null hour', () => {
    const hours = hoursOf((h) => (h === 14 ? null : h === 15 || h === 16 ? 10 : 100));
    expect(bestWindow(hours, opts)).toEqual({ startHour: 15, meanPm25: 10 });
  });
  it('returns null when everything is null, missing or the range is too short', () => {
    expect(
      bestWindow(
        hoursOf(() => null),
        opts,
      ),
    ).toBeNull();
    expect(worstWindow([], opts)).toBeNull();
    expect(
      bestWindow(
        hoursOf(() => 5),
        { ...opts, fromHour: 10, toHour: 11 },
      ),
    ).toBeNull();
  });
  it('ignores other days and matches by wall-clock text', () => {
    const other = hoursOf(() => 1, '2026-11-21');
    const today = hoursOf((h) => (h === 11 ? 5 : 50));
    expect(bestWindow([...other, ...today], opts)).toEqual({ startHour: 10, meanPm25: 27.5 });
    // only the wall-clock hour text matters; the data carries no offset
    const iso = [
      { time: `${DAY}T10:00`, pm25: 9 },
      { time: `${DAY}T11:00`, pm25: 9 },
    ];
    expect(bestWindow(iso, opts)).toEqual({ startHour: 10, meanPm25: 9 });
  });
  it('picks the earliest window on ties', () => {
    const flat = hoursOf(() => 40);
    expect(bestWindow(flat, opts)?.startHour).toBe(10);
    expect(worstWindow(flat, opts)?.startHour).toBe(10);
  });
});

describe('indoorAirTips', () => {
  const air = (band: 'good' | 'moderate' | 'severe') =>
    ({ band }) as unknown as Parameters<typeof indoorAirTips>[0]['air'];
  const forecast = {
    hours: hoursOf((h) => (h === 14 || h === 15 ? 20 : h === 7 || h === 8 || h === 9 ? 300 : 100)),
    source: 'CAMS via Open-Meteo' as const,
    fetchedAt: 'x',
  };
  const keys = (t: { key: string }[]) => t.map((x) => x.key);

  it('Severe gets noIncense, purifierNight, exhaustCooking, airOut and windowsShut', () => {
    const tips = indoorAirTips({ air: air('severe'), forecast, day: DAY, sensitive: false });
    expect(keys(tips)).toEqual([
      'airOut',
      'windowsShut',
      'purifierNight',
      'exhaustCooking',
      'noIncense',
    ]);
    expect(tips[0]?.params).toEqual({ from: 14, to: 16 });
    expect(tips[1]?.params).toEqual({ from: 7, to: 10 });
  });
  it('Good non-sensitive has no purifierNight or noIncense', () => {
    const k = keys(indoorAirTips({ air: air('good'), forecast, day: DAY, sensitive: false }));
    expect(k).not.toContain('purifierNight');
    expect(k).not.toContain('noIncense');
    expect(k).toContain('exhaustCooking');
  });
  it('sensitive households get purifierNight even when Good', () => {
    const k = keys(indoorAirTips({ air: air('good'), forecast, day: DAY, sensitive: true }));
    expect(k).toContain('purifierNight');
  });
  it('without a forecast: airOutUnavailable only', () => {
    const k = keys(
      indoorAirTips({ air: air('moderate'), forecast: null, day: DAY, sensitive: false }),
    );
    expect(k).toEqual(['airOutUnavailable', 'purifierNight', 'exhaustCooking']);
  });
  it('a forecast with no usable window is unavailable too', () => {
    const empty = { ...forecast, hours: hoursOf(() => null) };
    const k = keys(
      indoorAirTips({ air: air('good'), forecast: empty, day: DAY, sensitive: false }),
    );
    expect(k).toEqual(['airOutUnavailable', 'exhaustCooking']);
  });
});
