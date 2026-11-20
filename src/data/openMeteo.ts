import { z } from 'zod';
import { bandFor, computeAqi } from '../engine/aqi';
import type { AirReading, Forecast, Location } from '../types';
import { fetchJson } from './http';

const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const SOURCE = 'CAMS via Open-Meteo' as const;
const STATION = 'CAMS model grid (~40 km)';
const WINDOW_HOURS = 24;
const MIN_VALID_HOURS = 18;
const STALE_AFTER_MS = 3 * 3_600_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;

export class AirUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AirUnavailableError';
  }
}

export interface AirAndForecast {
  air: AirReading;
  forecast: Forecast;
}

const AirResponseSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    pm2_5: z.array(z.number().nullable()),
    pm10: z.array(z.number().nullable()),
  }),
});

// IST wall-clock "YYYY-MM-DDTHH:mm:ss" for an instant. Fixed +05:30, so the machine TZ never matters.
function istWallClock(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 19);
}

function toIstIso(instant: Date): string {
  return `${istWallClock(instant)}+05:30`;
}

function meanOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < MIN_VALID_HOURS) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

// One request gives the 24 h AQI window (past) and the forecast (from the current IST hour on).
export async function fetchAirAndForecast(loc: Location, now: Date): Promise<AirAndForecast> {
  const url =
    `${AIR_URL}?latitude=${loc.lat}&longitude=${loc.lon}` +
    '&hourly=pm2_5,pm10&past_days=1&forecast_days=2&timezone=Asia%2FKolkata';
  const { hourly } = await fetchJson(url, AirResponseSchema);
  const { time, pm2_5: pm25Series, pm10: pm10Series } = hourly;

  // Times are IST wall-clock, so the current hour is found by string match on the same format.
  const currentKey = `${istWallClock(now).slice(0, 13)}:00`;
  const current = time.indexOf(currentKey);
  if (current < 0) {
    throw new AirUnavailableError(`no air data for ${currentKey} IST`);
  }

  const windowStart = Math.max(0, current - WINDOW_HOURS + 1);
  const pm25 = meanOrNull(pm25Series.slice(windowStart, current + 1));
  const pm10 = meanOrNull(pm10Series.slice(windowStart, current + 1));
  const aqi = computeAqi(pm25, pm10);
  if (aqi === null) {
    throw new AirUnavailableError(`fewer than ${MIN_VALID_HOURS} valid hours in the last 24`);
  }

  // The window check above guarantees a value at or after windowStart, so this loop stops.
  let latest = current;
  while (pm25Series[latest] === null && pm10Series[latest] === null) latest -= 1;
  const observedAt = `${time[latest] ?? currentKey}:00+05:30`;
  const fetchedAt = toIstIso(now);

  const air: AirReading = {
    aqi: aqi.aqi,
    band: bandFor(aqi.aqi),
    pm25,
    pm10,
    dominantPollutant: aqi.dominantPollutant,
    source: SOURCE,
    stationOrGrid: STATION,
    observedAt,
    fetchedAt,
    isModelled: true,
    isStale: now.getTime() - Date.parse(observedAt) > STALE_AFTER_MS,
  };

  const forecast: Forecast = {
    hours: time.slice(current).map((t, i) => ({ time: t, pm25: pm25Series[current + i] ?? null })),
    source: SOURCE,
    fetchedAt,
  };

  return { air, forecast };
}
