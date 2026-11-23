import { describe, expect, it, vi } from 'vitest';
import type { createAirService } from '../data/airService';
import type { AirReading, Forecast, Location, Profile } from '../types';
import { createDegradedAssistant } from './degradedAssistant';

const delhi: Location = { city: 'Delhi', state: 'Delhi', lat: 28.61, lon: 77.21 };
const mumbai: Location = { city: 'Mumbai', state: 'Maharashtra', lat: 19.07, lon: 72.87 };
const aurMh: Location = { city: 'Aurangabad', state: 'Maharashtra', lat: 19.88, lon: 75.34 };
const aurBr: Location = { city: 'Aurangabad', state: 'Bihar', lat: 24.75, lon: 84.37 };
const nct = 'National Capital Territory of Delhi';
const delhiNames = ['Delhi', 'Delhi Cantonment', 'Parliament House', 'Sabzi Mandi'];
const manyDelhi: Location[] = [
  ...delhiNames.map((city) => ({ ...delhi, city, state: nct })),
  { ...delhi, city: 'Delhi', state: 'Madhya Pradesh', lat: 22.1, lon: 76.2 },
];
const places: Record<string, Location[]> = {
  Okhla: [{ city: 'Okhla Village', state: 'Bihar', lat: 25, lon: 85 }],
  Sabzi: manyDelhi,
  Delhi: [delhi],
  Mumbai: [mumbai],
  Aurangabad: [aurMh, aurBr],
};

const air: AirReading = {
  aqi: 223,
  band: 'poor',
  pm25: 150,
  pm10: 210,
  dominantPollutant: 'pm25',
  source: 'CAMS via Open-Meteo',
  stationOrGrid: 'x',
  observedAt: '2026-11-22T02:00:00.000Z',
  fetchedAt: '2026-11-22T02:00:00.000Z',
  isModelled: true,
  isStale: false,
};
const forecast: Forecast = { hours: [], source: 'CAMS via Open-Meteo', fetchedAt: air.fetchedAt };
const now = new Date('2026-11-22T02:30:00Z');
const empty: Profile = { household: [], activities: [] };
const adult = { group: 'adult' as const, respiratory: false, pregnant: false };
const commute = {
  kind: 'commute' as const,
  startHour: 8,
  durationMin: 40,
  distanceKm: 12,
  mode: 'bus' as const,
  participants: [0],
  flexible: false,
};

function setup(getAir?: ReturnType<typeof createAirService>['getAir']) {
  const geocode = vi.fn((q: string) => Promise.resolve(places[q] ?? []));
  const getAirFn = vi.fn(getAir ?? (() => Promise.resolve({ air, forecast })));
  const assistant = createDegradedAssistant({ geocode, air: { getAir: getAirFn } });
  const ask = (text: string, profile: Profile = empty, lang: 'en' | 'hi' = 'en') =>
    assistant({ messages: [{ role: 'user', text }], profile, lang, now });
  return { geocode, getAirFn, ask };
}

describe('degraded assistant', () => {
  it('Delhi gives a reading, a plan and a source-bearing reply', async () => {
    const { ask } = setup();
    const turn = await ask('Delhi');
    expect(turn.air?.aqi).toBe(223);
    expect(turn.plan).not.toBeNull();
    expect(turn.reply).toContain('223');
    expect(turn.reply).toContain('Open-Meteo');
    expect(turn.degraded).toBe(true);
    expect(turn.profile.location?.city).toBe('Delhi');
  });

  it('with a location but no household still builds a plan and asks via chips', async () => {
    const { ask } = setup();
    const turn = await ask('Delhi');
    expect(turn.plan?.indoorAirTips.length).toBeGreaterThan(0);
    expect(turn.chips).toEqual(['No one sensitive', 'Child at home', 'Elder with asthma']);
    expect(turn.profile.household).toEqual([]);
  });

  it('an ambiguous name returns candidates as chips and no plan', async () => {
    const { ask } = setup();
    const turn = await ask('Aurangabad');
    expect(turn.candidates).toHaveLength(2);
    expect(turn.chips).toEqual(['Aurangabad, Maharashtra', 'Aurangabad, Bihar']);
    expect(turn.plan).toBeNull();
  });

  it('a "City, State" chip pick resolves to that candidate', async () => {
    const { ask, getAirFn } = setup();
    const turn = await ask('Aurangabad, Bihar');
    expect(turn.profile.location).toEqual(aurBr);
    expect(getAirFn).toHaveBeenCalledWith(aurBr, now);
  });

  it('an unknown place gets a not-found reply', async () => {
    const { ask } = setup();
    const turn = await ask('London');
    expect(turn.reply).toMatch(/could not find/);
    expect(turn.air).toBeNull();
    expect(turn.profile.location).toBeUndefined();
  });

  it('air failure gives airUnavailable and no plan', async () => {
    const { ask } = setup(() => Promise.reject(new Error('down')));
    const turn = await ask('Delhi');
    expect(turn.notice).toBe('airUnavailable');
    expect(turn.plan).toBeNull();
    expect(turn.air).toBeNull();
  });

  it('a geocoding failure gives airUnavailable', async () => {
    const { ask, geocode } = setup();
    geocode.mockRejectedValueOnce(new Error('net'));
    expect((await ask('Delhi')).notice).toBe('airUnavailable');
  });

  it('replies in Hindi when the language is hi', async () => {
    const { ask } = setup();
    const turn = await ask('Delhi', empty, 'hi');
    expect(turn.reply).toMatch(/[ऀ-ॿ]/);
    expect(turn.reply).toContain('223');
    expect(turn.chips[0]).toBe('कोई संवेदनशील नहीं');
  });

  it('naming a new city replaces the location instead of keeping the old data', async () => {
    const { ask, getAirFn } = setup();
    const turn = await ask('Mumbai', { ...empty, location: delhi });
    expect(turn.profile.location?.city).toBe('Mumbai');
    expect(getAirFn).toHaveBeenCalledWith(mumbai, now);
  });

  it('the Car chip updates the activity mode and rebuilds the plan', async () => {
    const { ask, geocode } = setup();
    const turn = await ask('Car', { ...empty, location: delhi, activities: [commute] });
    expect(turn.profile.activities[0]?.mode).toBe('petrolCar');
    expect(geocode).not.toHaveBeenCalled();
    expect(turn.plan).not.toBeNull();
  });

  it('a household chip adds a sensitive member and asks for travel next', async () => {
    const { ask } = setup();
    const turn = await ask('Child at home', { ...empty, location: delhi });
    expect(turn.profile.household.map((m) => m.group)).toEqual(['adult', 'child']);
    expect(turn.plan?.sensitive).toBe(true);
    expect(turn.chips).toEqual(['Car', 'Metro', 'Bus', 'Two-wheeler']);
  });

  it('a follow-up chip does not trigger a place search', async () => {
    const { ask, geocode } = setup();
    const full = { location: delhi, household: [adult], activities: [commute] };
    const turn = await ask('Explain the AQI', full);
    expect(geocode).not.toHaveBeenCalled();
    expect(turn.air).not.toBeNull();
    expect(turn.chips).toContain('Explain the AQI');
  });

  it('asks for a location when there is none and the text is not a place', async () => {
    const { ask } = setup();
    const turn = await ask('Car');
    expect(turn.reply).toMatch(/Which city/);
    expect(turn.profile.activities[0]?.mode).toBe('petrolCar');
  });

  it('a candidate chip selects that exact place even when several share the state', async () => {
    const { ask, geocode, getAirFn } = setup();
    geocode.mockResolvedValue(manyDelhi);
    const picked = await ask(`Sabzi Mandi, ${nct}`);
    expect(picked.profile.location?.city).toBe('Sabzi Mandi');
    expect(picked.candidates).toEqual([]);
    expect(getAirFn).toHaveBeenCalledTimes(1);
  });

  it('with a city set, free text keeps the plan and hints how to change city', async () => {
    const { ask } = setup();
    const full = { location: delhi, household: [adult], activities: [commute] };
    for (const text of ['thanks', 'my grandmother is 70']) {
      const turn = await ask(text, full);
      expect(turn.plan).not.toBeNull();
      expect(turn.profile.location).toEqual(delhi);
      expect(turn.reply).toContain('To change city, type its name.');
    }
  });

  it('with a city set, a fuzzy geocode hit does not switch city', async () => {
    const { ask, geocode } = setup();
    geocode.mockResolvedValue([{ city: 'Okhla Village', state: 'Bihar', lat: 25, lon: 85 }]);
    const turn = await ask('ok', { ...empty, location: delhi });
    expect(turn.profile.location).toEqual(delhi);
    expect(turn.air).not.toBeNull();
  });

  it('with a city set, a geocode failure still shows the current city', async () => {
    const { ask, geocode } = setup();
    geocode.mockRejectedValue(new Error('offline'));
    const turn = await ask('thanks', { ...empty, location: delhi });
    expect(turn.notice).toBeUndefined();
    expect(turn.air).not.toBeNull();
  });

  it('retyping the current city does not offer candidates', async () => {
    const { ask, geocode } = setup();
    geocode.mockResolvedValue(manyDelhi);
    const turn = await ask('Delhi', { ...empty, location: delhi });
    expect(turn.candidates).toEqual([]);
    expect(turn.profile.location).toEqual(delhi);
  });

  it('the child follow-up chip leaves the household alone and says it only refreshes', async () => {
    const { ask, geocode } = setup();
    const full = { location: delhi, household: [adult], activities: [commute] };
    const turn = await ask('Can my child play outside at 5?', full);
    expect(turn.profile.household).toEqual([adult]);
    expect(turn.plan?.sensitive).toBe(false);
    expect(turn.reply).toMatch(/^Without a Gemini key I can only refresh the plan\./);
    expect(geocode).not.toHaveBeenCalled();
  });

  it('a Hindi follow-up chip stays a chip when the page is in English', async () => {
    const { ask, geocode } = setup();
    const full = { location: delhi, household: [adult], activities: [commute] };
    const turn = await ask('AQI समझाइए', full);
    expect(geocode).not.toHaveBeenCalled();
    expect(turn.air).not.toBeNull();
  });

  it('says so when a travel chip invents a default commute', async () => {
    const { ask } = setup();
    const turn = await ask('Metro', { ...empty, location: delhi, household: [adult] });
    expect(turn.reply).toContain('assuming a 10 km commute at 9:00');
    const kept = await ask('Metro', { location: delhi, household: [adult], activities: [commute] });
    expect(kept.reply).not.toContain('assuming');
  });
});
