import { describe, expect, it } from 'vitest';
import { TravelModeSchema } from '../types';
import { environmentForMode, inhaledDoseUg } from './exposure';
import { ENVIRONMENT_FACTORS } from './constants';

describe('inhaledDoseUg', () => {
  it('computes adult light activity outdoors for 60 minutes', () => {
    const dose = inhaledDoseUg({
      pm25: 100,
      group: 'adult',
      level: 'light',
      durationMin: 60,
      environment: 'outdoors',
    });
    expect(dose).toBeCloseTo(72, 6);
  });

  it('scales by the mask factor', () => {
    const dose = inhaledDoseUg({
      pm25: 100,
      group: 'adult',
      level: 'light',
      durationMin: 60,
      environment: 'outdoors',
      mask: 'n95',
    });
    expect(dose).toBeCloseTo(21.6, 6);
  });

  it('treats no mask as no mask factor', () => {
    const dose = inhaledDoseUg({
      pm25: 100,
      group: 'adult',
      level: 'light',
      durationMin: 60,
      environment: 'outdoors',
      mask: 'none',
    });
    expect(dose).toBeCloseTo(72, 6);
  });

  it('returns zero for zero duration', () => {
    const dose = inhaledDoseUg({
      pm25: 100,
      group: 'adult',
      level: 'moderate',
      durationMin: 0,
      environment: 'outdoors',
    });
    expect(dose).toBe(0);
  });

  it('gives children more dose than adults at the same activity', () => {
    const child = inhaledDoseUg({
      pm25: 100,
      group: 'child',
      level: 'moderate',
      durationMin: 60,
      environment: 'outdoors',
    });
    const adult = inhaledDoseUg({
      pm25: 100,
      group: 'adult',
      level: 'light',
      durationMin: 60,
      environment: 'outdoors',
    });
    expect(child).toBeGreaterThan(adult);
  });

  it('throws RangeError for negative or non-finite PM2.5', () => {
    const base = {
      group: 'adult',
      level: 'light',
      durationMin: 60,
      environment: 'outdoors',
    } as const;
    expect(() => inhaledDoseUg({ ...base, pm25: -1 })).toThrow(RangeError);
    expect(() => inhaledDoseUg({ ...base, pm25: Number.NaN })).toThrow(RangeError);
  });

  it('throws RangeError for negative or non-finite duration', () => {
    const base = { pm25: 100, group: 'adult', level: 'light', environment: 'outdoors' } as const;
    expect(() => inhaledDoseUg({ ...base, durationMin: -5 })).toThrow(RangeError);
    expect(() => inhaledDoseUg({ ...base, durationMin: Number.NaN })).toThrow(RangeError);
  });
});

describe('environmentForMode', () => {
  it('maps every travel mode to a known environment', () => {
    for (const mode of TravelModeSchema.options) {
      expect(Object.keys(ENVIRONMENT_FACTORS)).toContain(environmentForMode(mode));
    }
  });

  it('treats petrol and diesel cars as windows-open cars', () => {
    expect(environmentForMode('petrolCar')).toBe('carWindowsOpen');
    expect(environmentForMode('dieselCar')).toBe('carWindowsOpen');
  });
});
