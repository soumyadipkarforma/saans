import type { TravelMode } from '../types';
import { CO2_KG_PER_PKM, MODE_SPEED_KMH } from './constants';

const CAR_MODES: ReadonlySet<TravelMode> = new Set<TravelMode>(['petrolCar', 'dieselCar']);

function assertDistance(distanceKm: number): void {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError(`distanceKm must be a non-negative finite number, got ${distanceKm}`);
  }
}

function lookup(table: Record<TravelMode, number>, mode: TravelMode): number {
  const value = table[mode];
  if (value === undefined) throw new Error('unknown mode');
  return value;
}

export function tripCo2Kg(distanceKm: number, mode: TravelMode, occupants = 1): number {
  assertDistance(distanceKm);
  if (!Number.isFinite(occupants) || occupants < 1) {
    throw new RangeError(`occupants must be at least 1, got ${occupants}`);
  }
  const emitted = distanceKm * lookup(CO2_KG_PER_PKM, mode);
  return CAR_MODES.has(mode) ? emitted / occupants : emitted;
}

export function tripDurationMin(distanceKm: number, mode: TravelMode): number {
  assertDistance(distanceKm);
  return (distanceKm / lookup(MODE_SPEED_KMH, mode)) * 60;
}
