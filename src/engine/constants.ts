import type { AqiBand, PersonGroup, TravelMode, ActivityKind } from '../types';

export type ActivityLevel = 'rest' | 'light' | 'moderate';
export type Sensitivity = 'general' | 'sensitive';

// CPCB, National Air Quality Index, 2014. Upper bounds as [concentration, AQI] pairs; each band starts where the previous one ends.
export const PM25_BREAKPOINTS = [
  [30, 50],
  [60, 100],
  [90, 200],
  [120, 300],
  [250, 400],
  [380, 500],
] as const;

// CPCB, National Air Quality Index, 2014. Upper bounds as [concentration, AQI] pairs; each band starts where the previous one ends.
export const PM10_BREAKPOINTS = [
  [50, 50],
  [100, 100],
  [250, 200],
  [350, 300],
  [430, 400],
  [600, 500],
] as const;

export const AQI_MAX = 500;

// US EPA, Exposure Factors Handbook 2011, Ch. 6, Table 6-2 (short-term), rounded. Units m³/h.
export const BREATHING_RATE_M3_PER_H: Record<PersonGroup, Record<ActivityLevel, number>> = {
  child: { rest: 0.29, light: 0.66, moderate: 1.26 },
  adult: { rest: 0.31, light: 0.72, moderate: 1.56 },
  elderly: { rest: 0.3, light: 0.72, moderate: 1.44 },
};

// assumption: order of magnitude from Goel et al. 2015 (Delhi commuter exposure) and Chen & Zhao 2011 (infiltration review); indoor/vehicle ÷ outdoor PM2.5.
export const ENVIRONMENT_FACTORS = {
  outdoors: 1.0,
  walk: 1.0,
  cycle: 1.0,
  twoWheeler: 1.0,
  cngAuto: 0.9,
  carWindowsOpen: 0.9,
  bus: 0.85,
  metro: 0.6,
  carAcRecirc: 0.45,
  indoorsWindowsShut: 0.6,
  indoorsPurifier: 0.3,
} as const;

// assumption: fraction of outdoor PM2.5 inhaled with each mask, from real-world mask fit studies.
export const MASK_FACTORS = {
  none: 1.0,
  clothSurgical: 0.7,
  n95: 0.3,
} as const;

// India GHG Program, India Specific Road Transport Emission Factors 2015; DMRC sustainability report for metro. Units kg CO₂ per passenger-km.
export const CO2_KG_PER_PKM: Record<TravelMode, number> = {
  petrolCar: 0.14,
  dieselCar: 0.15,
  cngAuto: 0.08,
  twoWheeler: 0.035,
  bus: 0.015,
  metro: 0.01,
  walk: 0,
  cycle: 0,
};

// assumption: Indian metro-city average door-to-door speeds. Units km/h.
export const MODE_SPEED_KMH: Record<TravelMode, number> = {
  petrolCar: 20,
  dieselCar: 20,
  cngAuto: 18,
  twoWheeler: 22,
  bus: 15,
  metro: 32,
  walk: 4.5,
  cycle: 12,
};

// assumption: typical trip length when the user does not give one. Units km.
export const DEFAULT_TRIP_KM: Record<ActivityKind, number> = {
  schoolRun: 4,
  commute: 12,
  errand: 3,
  walk: 2,
  play: 0,
  exercise: 0,
};

// assumption: average car occupancy for a shared ride when none is given.
export const CARPOOL_OCCUPANTS = 3;

// Sensitivity thresholds: outdoor activity above these bands is advised against.
export const MAX_OUTDOOR_BAND: Record<Sensitivity, AqiBand> = {
  general: 'poor',
  sensitive: 'moderate',
};

// assumption: mask advice starts at this band (no source cited in brief).
export const MASK_FROM_BAND: AqiBand = 'poor';

// assumption: air purifier advice starts at this band (no source cited in brief).
export const PURIFIER_FROM_BAND: AqiBand = 'moderate';

// assumption: incense and candle advice starts at this band (no source cited in brief).
export const NO_INCENSE_FROM_BAND: AqiBand = 'veryPoor';

// assumption: local hours considered reasonable for outdoor activity, [start, end] inclusive.
export const REASONABLE_HOURS: readonly [number, number] = [6, 21];
