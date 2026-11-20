import { describe, expect, it } from 'vitest';
import type { TravelMode } from '../types';
import { computeSwapImpact } from './impact';

const base = { distanceKm: 10, pm25: 200, group: 'adult' as const };

describe('computeSwapImpact', () => {
  it('reports CO2 saved by carpooling with three occupants by default', () => {
    const impact = computeSwapImpact({
      ...base,
      pm25: 100,
      fromMode: 'petrolCar',
      toMode: 'carpool',
    });
    expect(impact.co2SavedKg).toBe(0.93);
  });

  it('uses explicit occupants for carpool', () => {
    const impact = computeSwapImpact({
      ...base,
      pm25: 100,
      fromMode: 'petrolCar',
      toMode: 'carpool',
      occupants: 2,
    });
    expect(impact.co2SavedKg).toBe(0.7);
  });

  it('saves no per-person exposure when carpooling a petrol car', () => {
    const impact = computeSwapImpact({ ...base, fromMode: 'petrolCar', toMode: 'carpool' });
    expect(impact.exposureSavedUg).toBe(0);
    expect(impact.exposureSavedPct).toBe(0);
  });

  it('shows a positive saving from petrol car to metro', () => {
    const impact = computeSwapImpact({ ...base, fromMode: 'petrolCar', toMode: 'metro' });
    expect(impact.exposureSavedUg).toBe(37.8);
    expect(impact.exposureSavedPct).toBe(58);
    expect(impact.co2SavedKg).toBe(1.3);
  });

  it('shows negative exposure saving but positive CO2 saving from petrol car to walk', () => {
    const impact = computeSwapImpact({ ...base, fromMode: 'petrolCar', toMode: 'walk' });
    expect(impact.exposureSavedUg).toBeLessThan(0);
    expect(impact.exposureSavedPct).toBeLessThan(0);
    expect(impact.co2SavedKg).toBe(1.4);
  });

  it('returns all zeros for a zero-distance trip without NaN or -0', () => {
    const impact = computeSwapImpact({
      ...base,
      distanceKm: 0,
      fromMode: 'petrolCar',
      toMode: 'metro',
    });
    expect(impact).toEqual({ exposureSavedUg: 0, exposureSavedPct: 0, co2SavedKg: 0 });
    expect(Object.is(impact.exposureSavedPct, 0)).toBe(true);
    expect(Object.is(impact.exposureSavedUg, 0)).toBe(true);
    expect(Object.is(impact.co2SavedKg, 0)).toBe(true);
  });

  it('returns zero percentage when there is no exposure to save', () => {
    const impact = computeSwapImpact({ ...base, pm25: 0, fromMode: 'petrolCar', toMode: 'metro' });
    expect(impact.exposureSavedPct).toBe(0);
  });

  it('throws for an unknown from mode', () => {
    expect(() =>
      computeSwapImpact({ ...base, fromMode: 'rocket' as TravelMode, toMode: 'walk' }),
    ).toThrow('unknown mode');
  });

  it('throws for an unknown to mode', () => {
    expect(() =>
      computeSwapImpact({ ...base, fromMode: 'petrolCar', toMode: 'rocket' as TravelMode }),
    ).toThrow('unknown mode');
  });
});
