import { describe, expect, it } from 'vitest';
import type { AirReading, DayPlan, Profile } from '../types';
import { chipsFor, parseQuick, templateReply } from './templates';

const air = { aqi: 310, band: 'veryPoor', source: 'CAMS via Open-Meteo' } as AirReading;
const plan = (sensitive: boolean) =>
  ({ lowEmissionRoutine: [], sustainableSwaps: [], indoorAirTips: [], sensitive }) as DayPlan;
const empty: Profile = { household: [], activities: [] };
const loc = { city: 'Delhi', lat: 28.6, lon: 77.2 };

describe('templateReply', () => {
  it('interpolates city, band and AQI from the data in two sentences', () => {
    expect(templateReply('en', air, plan(false), 'Delhi')).toBe(
      'Air in Delhi is Very poor, AQI 310. Source: CAMS via Open-Meteo, a modelled estimate.',
    );
  });

  it('adds the cautious note for sensitive households', () => {
    const r = templateReply('en', air, plan(true), 'Delhi');
    expect(r).toContain('310');
    expect(r).toContain('Open-Meteo');
    expect(r).toContain('cautious');
  });

  it('has a Hindi version', () => {
    expect(templateReply('hi', air, plan(false), 'Delhi')).toMatch(/[ऀ-ॿ]/);
  });
});

describe('chipsFor', () => {
  it('offers nothing before a location is known', () => {
    expect(chipsFor(empty, null, 'en')).toEqual([]);
  });

  it('asks for household, then travel, then offers follow-ups', () => {
    expect(chipsFor({ ...empty, location: loc }, null, 'en')).toHaveLength(3);
    const adult = { group: 'adult' as const, respiratory: false, pregnant: false };
    const withHome = { ...empty, location: loc, household: [adult] };
    expect(chipsFor(withHome, null, 'en')).toEqual(['Car', 'Metro', 'Bus', 'Two-wheeler']);
    const trip = {
      ...withHome,
      activities: [{ kind: 'commute' as const, participants: [0], flexible: false }],
    };
    expect(chipsFor(trip, plan(false), 'en')).toEqual([
      'What if I work from home?',
      'Can my child play outside at 5?',
      'Explain the AQI',
    ]);
    expect(chipsFor(trip, null, 'en')).toEqual([]);
  });
});

describe('parseQuick', () => {
  const base: Profile = {
    ...empty,
    activities: [{ kind: 'commute', mode: 'bus', participants: [0], flexible: false }],
  };

  it('sets the travel mode on existing activities in English and Hindi', () => {
    expect(parseQuick('Metro', base).activities?.[0]?.mode).toBe('metro');
    expect(parseQuick('कार', base).activities?.[0]?.mode).toBe('petrolCar');
    expect(parseQuick('Two-wheeler', base).activities?.[0]?.mode).toBe('twoWheeler');
    expect(parseQuick('मेट्रो', base).activities?.[0]?.mode).toBe('metro');
    expect(parseQuick('walk', base).activities?.[0]?.mode).toBe('walk');
  });

  it('creates a default commute when there is no activity yet', () => {
    expect(parseQuick('Bus', empty).activities).toHaveLength(1);
  });

  it('adds sensitive members without duplicating', () => {
    const child = parseQuick('Child at home', empty).household;
    expect(child?.map((m) => m.group)).toEqual(['adult', 'child']);
    expect(parseQuick('बच्चा', { ...empty, household: child ?? [] }).household).toHaveLength(2);
    expect(parseQuick('Elder with asthma', empty).household?.[1]).toMatchObject({
      group: 'elderly',
      respiratory: true,
    });
    expect(parseQuick('asthma', empty).household?.[1]?.respiratory).toBe(true);
    // "with" now separates clauses, so the asthma must sit in the same clause as the child.
    expect(parseQuick('my child has asthma', empty).household?.[1]).toMatchObject({
      group: 'child',
      respiratory: true,
    });
  });

  it('"no one sensitive" sets a single adult', () => {
    expect(parseQuick('No one sensitive', empty).household).toHaveLength(1);
    expect(parseQuick('कोई संवेदनशील नहीं', empty).household).toHaveLength(1);
  });

  it('adds outdoor activities without giving them the travel mode', () => {
    const out = parseQuick('Evening stroll', base).activities;
    expect(out?.map((a) => a.kind)).toEqual(['commute', 'walk']);
    expect(parseQuick('Playing outdoors', empty).activities?.[0]).toMatchObject({ kind: 'play' });
    expect(parseQuick('School run', empty).activities?.[0]).toMatchObject({ kind: 'schoolRun' });
    expect(parseQuick('शाम की सैर', empty).activities?.[0]).toMatchObject({ kind: 'walk' });
    const mode = parseQuick('Metro', { ...empty, activities: out ?? [] }).activities;
    expect(mode?.map((a) => a.mode)).toEqual(['metro', undefined]);
    expect(parseQuick('Evening stroll', { ...empty, activities: out ?? [] })).toEqual({});
  });

  it('returns nothing for a city name or other text', () => {
    expect(parseQuick('Mumbai', empty)).toEqual({});
    expect(parseQuick('Explain the AQI', empty)).toEqual({});
  });
});
