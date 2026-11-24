import type { PersonGroup, SwapImpact, TravelMode } from '../types';
import { CARPOOL_OCCUPANTS } from './constants';
import { tripCo2Kg, tripDurationMin } from './emissions';
import { environmentForMode, inhaledDoseUg } from './exposure';

// Rounds to `dp` places and turns -0 into 0 so the output never shows "-0".
export function round(x: number, dp: number): number {
  const scale = 10 ** dp;
  const rounded = Math.round(x * scale) / scale;
  return rounded === 0 ? 0 : rounded;
}

export function tripExposureUg(
  distanceKm: number,
  mode: TravelMode,
  pm25: number,
  group: PersonGroup,
): number {
  const walkingOrCycling = mode === 'walk' || mode === 'cycle';
  return inhaledDoseUg({
    pm25,
    group,
    level: walkingOrCycling ? 'moderate' : 'light',
    durationMin: tripDurationMin(distanceKm, mode),
    environment: environmentForMode(mode),
  });
}

// `occupants` applies only to a carpool trip (default CARPOOL_OCCUPANTS).
export function computeSwapImpact(input: {
  distanceKm: number;
  fromMode: TravelMode;
  toMode: TravelMode | 'carpool';
  pm25: number;
  group: PersonGroup;
  occupants?: number;
}): SwapImpact {
  const { distanceKm, fromMode, toMode, pm25, group, occupants } = input;
  const toCarpool = toMode === 'carpool';
  const toTravel: TravelMode = toCarpool ? 'petrolCar' : toMode;
  const toOccupants = toCarpool ? (occupants ?? CARPOOL_OCCUPANTS) : 1;

  const fromExposure = tripExposureUg(distanceKm, fromMode, pm25, group);
  const toExposure = tripExposureUg(distanceKm, toTravel, pm25, group);
  const savedUg = fromExposure - toExposure;
  const fromCo2 = tripCo2Kg(distanceKm, fromMode);
  const toCo2 = tripCo2Kg(distanceKm, toTravel, toOccupants);

  return {
    exposureSavedUg: round(savedUg, 1),
    exposureSavedPct: fromExposure > 0 ? round((savedUg / fromExposure) * 100, 0) : 0,
    co2SavedKg: round(fromCo2 - toCo2, 2),
  };
}
