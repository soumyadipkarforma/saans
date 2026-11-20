import { describe, expect, it } from 'vitest';
import { bandAtLeast, bandFor, BAND_ORDER, computeAqi, subIndex } from './aqi';

describe('subIndex', () => {
  it('interpolates PM2.5 on the CPCB breakpoints', () => {
    expect(subIndex('pm25', 0)).toBe(0);
    expect(subIndex('pm25', 30)).toBe(50);
    expect(subIndex('pm25', 60)).toBe(100);
    expect(subIndex('pm25', 90)).toBe(200);
    expect(subIndex('pm25', 120)).toBe(300);
    expect(subIndex('pm25', 250)).toBe(400);
  });

  it('has no gap between bands (30.5 is not dropped)', () => {
    expect(subIndex('pm25', 30.5)).toBe(51);
  });

  it('clamps above the last breakpoint to 500', () => {
    expect(subIndex('pm25', 1000)).toBe(500);
  });

  it('interpolates PM10 on the CPCB breakpoints', () => {
    expect(subIndex('pm10', 100)).toBe(100);
  });

  it('throws RangeError for negative or non-finite concentrations', () => {
    expect(() => subIndex('pm25', -1)).toThrow(RangeError);
    expect(() => subIndex('pm10', Number.NaN)).toThrow(RangeError);
  });
});

describe('computeAqi', () => {
  it('returns null when both pollutants are missing', () => {
    expect(computeAqi(null, null)).toBeNull();
  });

  it('takes the worst sub-index and names its pollutant', () => {
    const result = computeAqi(45, 300);
    expect(result?.dominantPollutant).toBe('pm10');
    expect(result?.aqi).toBe(250);
  });

  it('reports PM2.5 when it is the worst', () => {
    expect(computeAqi(100, 10)?.dominantPollutant).toBe('pm25');
  });

  it('uses the only available pollutant when the other is null', () => {
    expect(computeAqi(null, 300)).toEqual({ aqi: 250, dominantPollutant: 'pm10' });
    expect(computeAqi(100, null)).toEqual({ aqi: 233, dominantPollutant: 'pm25' });
  });
});

describe('bandFor', () => {
  it.each([
    [0, 'good'],
    [50, 'good'],
    [51, 'satisfactory'],
    [100, 'satisfactory'],
    [101, 'moderate'],
    [200, 'moderate'],
    [201, 'poor'],
    [300, 'poor'],
    [301, 'veryPoor'],
    [400, 'veryPoor'],
    [401, 'severe'],
    [500, 'severe'],
  ] as const)('maps AQI %i to %s', (aqi, band) => {
    expect(bandFor(aqi)).toBe(band);
  });
});

describe('band ordering', () => {
  it('lists bands from best to worst', () => {
    expect(BAND_ORDER).toEqual(['good', 'satisfactory', 'moderate', 'poor', 'veryPoor', 'severe']);
  });

  it('compares bands by severity', () => {
    expect(bandAtLeast('severe', 'poor')).toBe(true);
    expect(bandAtLeast('good', 'poor')).toBe(false);
    expect(bandAtLeast('poor', 'poor')).toBe(true);
  });
});
