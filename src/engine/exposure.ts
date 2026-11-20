import type { PersonGroup, TravelMode } from '../types';
import {
  BREATHING_RATE_M3_PER_H,
  ENVIRONMENT_FACTORS,
  MASK_FACTORS,
  type ActivityLevel,
} from './constants';

export type { ActivityLevel } from './constants';
export type Environment = keyof typeof ENVIRONMENT_FACTORS;
export type Mask = keyof typeof MASK_FACTORS;

const MODE_ENVIRONMENT: Record<TravelMode, Environment> = {
  petrolCar: 'carWindowsOpen',
  dieselCar: 'carWindowsOpen',
  cngAuto: 'cngAuto',
  twoWheeler: 'twoWheeler',
  bus: 'bus',
  metro: 'metro',
  walk: 'walk',
  cycle: 'cycle',
};

export function environmentForMode(mode: TravelMode): Environment {
  return MODE_ENVIRONMENT[mode];
}

export function inhaledDoseUg(input: {
  pm25: number;
  group: PersonGroup;
  level: ActivityLevel;
  durationMin: number;
  environment: Environment;
  mask?: Mask;
}): number {
  const { pm25, group, level, durationMin, environment, mask = 'none' } = input;
  if (!Number.isFinite(pm25) || pm25 < 0) {
    throw new RangeError(`pm25 must be a non-negative finite number, got ${pm25}`);
  }
  if (!Number.isFinite(durationMin) || durationMin < 0) {
    throw new RangeError(`durationMin must be a non-negative finite number, got ${durationMin}`);
  }
  const hours = durationMin / 60;
  return (
    pm25 *
    BREATHING_RATE_M3_PER_H[group][level] *
    hours *
    ENVIRONMENT_FACTORS[environment] *
    MASK_FACTORS[mask]
  );
}
