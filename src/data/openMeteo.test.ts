process.env.TZ = 'UTC';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { bandFor, computeAqi } from '../engine/aqi';
import type { Location } from '../types';
import { UpstreamError } from './http';
import { AirUnavailableError, fetchAirAndForecast } from './openMeteo';

const fixtures = import.meta.glob<unknown>('./fixtures/*.json', { eager: true, import: 'default' });

function fixture(name: string): unknown {
  const value = fixtures[`./fixtures/${name}`];
  if (value === undefined) throw new Error(`missing fixture ${name}`);
  return JSON.parse(JSON.stringify(value)) as unknown;
}

const DELHI: Location = { city: 'Delhi', state: 'Delhi', lat: 28.61, lon: 77.21 };
// 23:04 IST on 2026-11-20; the fixture's current hour is 2026-11-20T23:00.
const NOW = new Date('2026-11-20T17:34:00Z');
const WINDOW_START = 24; // 2026-11-20T00:00, first of the 24 hours ending at 23:00
const CURRENT = 47; // 2026-11-20T23:00

type Hourly = { time: string[]; pm2_5: (number | null)[]; pm10: (number | null)[] };

function hourly(response: unknown): Hourly {
  return (response as { hourly: Hourly }).hourly;
}

function stubFetchWith(body: unknown) {
  const fn = vi.fn<typeof fetch>(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as unknown as Response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

// Builds a 72-hour response in the same shape as Open-Meteo, starting 2026-11-19T00:00 IST.
function responseWith(pm25: (number | null)[], pm10: (number | null)[]): unknown {
  const time = pm25.map((_, i) =>
    new Date(Date.UTC(2026, 10, 19) + i * 3_600_000).toISOString().slice(0, 16),
  );
  return { hourly: { time, pm2_5: pm25, pm10 } };
}

function mean(values: (number | null)[]): number {
  const valid = values.filter((v): v is number => v !== null);
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAirAndForecast', () => {
  it('runs in UTC so the wall-clock assertions are deterministic', () => {
    expect(new Date().getTimezoneOffset()).toBe(0);
  });

  it('requests the Open-Meteo air endpoint for the location in IST', async () => {
    const fetchMock = stubFetchWith(fixture('air-delhi.json'));
    await fetchAirAndForecast(DELHI, NOW);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.61&longitude=77.21&hourly=pm2_5,pm10&past_days=1&forecast_days=2&timezone=Asia%2FKolkata',
      expect.anything(),
    );
  });

  it('computes AQI from the 24-hour means and reports the dominant pollutant', async () => {
    stubFetchWith(fixture('air-delhi.json'));
    const { air } = await fetchAirAndForecast(DELHI, NOW);

    const h = hourly(fixture('air-delhi.json'));
    const expected = computeAqi(
      mean(h.pm2_5.slice(WINDOW_START, CURRENT + 1)),
      mean(h.pm10.slice(WINDOW_START, CURRENT + 1)),
    );
    expect(expected).not.toBeNull();
    expect(air.aqi).toBe(expected?.aqi);
    expect(air.dominantPollutant).toBe(expected?.dominantPollutant);
    expect(air.band).toBe(bandFor(air.aqi));
    expect(air.pm25).toBeCloseTo(mean(h.pm2_5.slice(WINDOW_START, CURRENT + 1)), 10);
    expect(air.pm10).toBeCloseTo(mean(h.pm10.slice(WINDOW_START, CURRENT + 1)), 10);
  });

  it('labels the reading as a modelled CAMS estimate with its timestamps', async () => {
    stubFetchWith(fixture('air-delhi.json'));
    const { air } = await fetchAirAndForecast(DELHI, NOW);
    expect(air).toMatchObject({
      source: 'CAMS via Open-Meteo',
      stationOrGrid: 'CAMS model grid (~40 km)',
      isModelled: true,
      fetchedAt: '2026-11-20T23:04:00+05:30',
      observedAt: '2026-11-20T23:00:00+05:30',
      isStale: false,
    });
  });

  it('keeps forecast hour strings as IST wall-clock and starts at the current hour', async () => {
    stubFetchWith(fixture('air-delhi.json'));
    const { forecast } = await fetchAirAndForecast(DELHI, NOW);
    expect(forecast.source).toBe('CAMS via Open-Meteo');
    expect(forecast.fetchedAt).toBe('2026-11-20T23:04:00+05:30');
    expect(forecast.hours).toHaveLength(25);
    expect(forecast.hours[0]?.time).toBe('2026-11-20T23:00');
    expect(forecast.hours.at(-1)?.time).toBe('2026-11-21T23:00');
    const h = hourly(fixture('air-delhi.json'));
    expect(forecast.hours[0]?.pm25).toBe(h.pm2_5[CURRENT]);
  });

  it('tolerates null hours and averages only the values present', async () => {
    const h = hourly(fixture('air-delhi.json'));
    const pm25 = [...h.pm2_5];
    const pm10 = [...h.pm10];
    pm25[30] = null;
    pm25[31] = null;
    pm10[40] = null;
    stubFetchWith(responseWith(pm25, pm10));

    const { air } = await fetchAirAndForecast(DELHI, NOW);

    const pm25Window = pm25.slice(WINDOW_START, CURRENT + 1).filter((v) => v !== null);
    const pm10Window = pm10.slice(WINDOW_START, CURRENT + 1).filter((v) => v !== null);
    expect(air.pm25).toBeCloseTo(mean(pm25Window), 10);
    expect(air.pm10).toBeCloseTo(mean(pm10Window), 10);
  });

  it('throws AirUnavailableError when fewer than 18 of the 24 hours have values', async () => {
    const pm25 = Array.from({ length: 72 }, (_, i) => (i >= 24 && i < 34 ? 50 : null));
    const pm10 = [...pm25];
    stubFetchWith(responseWith(pm25, pm10));
    const err = await fetchAirAndForecast(DELHI, NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AirUnavailableError);
    expect((err as Error).name).toBe('AirUnavailableError');
  });

  it('marks the reading stale when the latest value is more than 3 hours old', async () => {
    const h = hourly(fixture('air-delhi.json'));
    const pm25 = [...h.pm2_5];
    const pm10 = [...h.pm10];
    for (let i = 44; i <= CURRENT; i++) {
      pm25[i] = null;
      pm10[i] = null;
    }
    stubFetchWith(responseWith(pm25, pm10));
    const { air } = await fetchAirAndForecast(DELHI, NOW);
    expect(air.observedAt).toBe('2026-11-20T19:00:00+05:30');
    expect(air.isStale).toBe(true);
  });

  it('throws AirUnavailableError when the response has no hour for the current time', async () => {
    stubFetchWith(fixture('air-delhi.json'));
    await expect(
      fetchAirAndForecast(DELHI, new Date('2031-01-01T00:00:00Z')),
    ).rejects.toBeInstanceOf(AirUnavailableError);
  });

  it('propagates upstream failures as UpstreamError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const err = await fetchAirAndForecast(DELHI, NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
  });
});
