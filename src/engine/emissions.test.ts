import { describe, expect, it } from 'vitest';
import type { TravelMode } from '../types';
import { tripCo2Kg, tripDurationMin } from './emissions';

describe('tripCo2Kg', () => {
  it('computes a solo petrol car trip', () => {
    expect(tripCo2Kg(10, 'petrolCar')).toBeCloseTo(1.4, 6);
  });

  it('divides car emissions across occupants', () => {
    expect(tripCo2Kg(10, 'petrolCar', 3)).toBeCloseTo(0.4667, 4);
    expect(tripCo2Kg(10, 'dieselCar', 2)).toBeCloseTo(0.75, 6);
  });

  it('ignores occupants for non-car modes', () => {
    expect(tripCo2Kg(10, 'metro', 3)).toBeCloseTo(0.1, 6);
  });

  it('returns zero for a zero-distance trip', () => {
    expect(tripCo2Kg(0, 'petrolCar')).toBe(0);
  });

  it('throws RangeError for negative or non-finite distance', () => {
    expect(() => tripCo2Kg(-1, 'metro')).toThrow(RangeError);
    expect(() => tripCo2Kg(Number.NaN, 'metro')).toThrow(RangeError);
  });

  it('throws RangeError for fewer than one occupant', () => {
    expect(() => tripCo2Kg(10, 'petrolCar', 0)).toThrow(RangeError);
    expect(() => tripCo2Kg(10, 'petrolCar', Number.NaN)).toThrow(RangeError);
  });

  it('throws for an unknown mode', () => {
    expect(() => tripCo2Kg(10, 'rocket' as TravelMode)).toThrow('unknown mode');
  });
});

describe('tripDurationMin', () => {
  it('converts distance and average speed to minutes', () => {
    expect(tripDurationMin(10, 'walk')).toBeCloseTo(133.333, 2);
    expect(tripDurationMin(10, 'metro')).toBeCloseTo(18.75, 6);
  });

  it('returns zero for a zero-distance trip', () => {
    expect(tripDurationMin(0, 'walk')).toBe(0);
  });

  it('throws RangeError for negative distance', () => {
    expect(() => tripDurationMin(-2, 'walk')).toThrow(RangeError);
  });

  it('throws for an unknown mode', () => {
    expect(() => tripDurationMin(10, 'rocket' as TravelMode)).toThrow('unknown mode');
  });
});
