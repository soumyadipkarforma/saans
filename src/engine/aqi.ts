import type { AqiBand } from '../types';
import { AQI_MAX, PM10_BREAKPOINTS, PM25_BREAKPOINTS } from './constants';

export type Pollutant = 'pm25' | 'pm10';

const BREAKPOINTS: Record<Pollutant, readonly (readonly [number, number])[]> = {
  pm25: PM25_BREAKPOINTS,
  pm10: PM10_BREAKPOINTS,
};

const BAND_UPPER: readonly [number, AqiBand][] = [
  [50, 'good'],
  [100, 'satisfactory'],
  [200, 'moderate'],
  [300, 'poor'],
  [400, 'veryPoor'],
];

export const BAND_ORDER: AqiBand[] = [
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'veryPoor',
  'severe',
];

// Linear interpolation within the first band whose upper bound covers the concentration.
export function subIndex(pollutant: Pollutant, conc: number): number {
  if (!Number.isFinite(conc) || conc < 0) {
    throw new RangeError(`concentration must be a non-negative finite number, got ${conc}`);
  }
  let loC = 0;
  let loI = 0;
  for (const [hiC, hiI] of BREAKPOINTS[pollutant]) {
    if (conc <= hiC) {
      return Math.round(((hiI - loI) / (hiC - loC)) * (conc - loC) + loI);
    }
    loC = hiC;
    loI = hiI;
  }
  return AQI_MAX;
}

export function computeAqi(
  pm25: number | null,
  pm10: number | null,
): { aqi: number; dominantPollutant: Pollutant } | null {
  const readings: [Pollutant, number][] = [];
  if (pm25 !== null) readings.push(['pm25', subIndex('pm25', pm25)]);
  if (pm10 !== null) readings.push(['pm10', subIndex('pm10', pm10)]);
  if (readings.length === 0) return null;
  // Ties go to PM2.5 (first in the list).
  const [dominantPollutant, aqi] = readings.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  return { aqi, dominantPollutant };
}

export function bandFor(aqi: number): AqiBand {
  for (const [upper, band] of BAND_UPPER) {
    if (aqi <= upper) return band;
  }
  return 'severe';
}

export function bandAtLeast(a: AqiBand, b: AqiBand): boolean {
  return BAND_ORDER.indexOf(a) >= BAND_ORDER.indexOf(b);
}
