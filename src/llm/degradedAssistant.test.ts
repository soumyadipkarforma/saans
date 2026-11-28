import { describe, expect, it, vi } from 'vitest';
import type { createAirService } from '../data/airService';
import type { AirReading, Forecast, Location, Profile } from '../types';
import { t } from '../i18n/i18n';
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
const pune: Location = { city: 'Pune', state: 'Maharashtra', lat: 18.52, lon: 73.86 };
const twinA: Location = { city: 'Twin', state: 'Goa', lat: 15.3, lon: 74 };
const twinB: Location = { city: 'Twin', state: 'Assam', lat: 26.1, lon: 91.7 };
const places: Record<string, Location[]> = {
  Pune: [
    pune,
    { city: 'Puneta', lat: 25, lon: 85 },
    { city: 'Puneir', lat: 24, lon: 84 },
    { city: 'Puneja', lat: 23, lon: 83 },
  ],
  Twin: [twinA, twinB],
  Okhla: [{ city: 'Okhla Village', state: 'Bihar', lat: 25, lon: 85 }],
  Sabzi: manyDelhi,
  Delhi: [delhi],
  Mumbai: [mumbai],
  Aurangabad: [aurMh, aurBr],
  // No exact-name match, so several results mean the user has to choose.
  Nagar: [
    { city: 'Nagar Haveli', state: 'Dadra', lat: 20.1, lon: 73 },
    { city: 'Nagar Kurnool', state: 'Telangana', lat: 16.5, lon: 78.3 },
  ],
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

  it('with a location but no household still builds a plan and asks the area first', async () => {
    const { ask } = setup();
    const turn = await ask('Delhi');
    expect(turn.plan?.indoorAirTips.length).toBeGreaterThan(0);
    expect(turn.reply).toContain('Which part of Delhi do you live in?');
    expect(turn.chips).toEqual([t('chip.skipArea', {}, 'en')]);
    expect(turn.profile.household).toEqual([]);
  });

  it('a partial name with several matches returns candidates as chips and no plan', async () => {
    const { ask } = setup();
    const turn = await ask('Nagar');
    expect(turn.candidates).toHaveLength(2);
    expect(turn.chips).toEqual(['Nagar Haveli, Dadra', 'Nagar Kurnool, Telangana']);
    expect(turn.plan).toBeNull();
  });

  it('an exact city name shared by two places picks the first one', async () => {
    const { ask } = setup();
    const turn = await ask('Aurangabad');
    expect(turn.candidates).toEqual([]);
    expect(turn.profile.location).toEqual(aurMh);
    expect(turn.plan).not.toBeNull();
  });

  it('selects the single exact city name over look-alikes', async () => {
    const { ask } = setup();
    const turn = await ask('Pune');
    expect(turn.candidates).toEqual([]);
    expect(turn.profile.location).toEqual(pune);
    expect(turn.air).not.toBeNull();
  });

  it('takes the first of two cities that share the exact name', async () => {
    const { ask } = setup();
    const turn = await ask('Twin');
    expect(turn.candidates).toEqual([]);
    expect(turn.profile.location).toEqual(twinA);
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
    expect(turn.chips[0]).toBe(t('chip.skipArea', {}, 'hi'));
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

  it('with a city set, free text keeps the plan: thanks is answered, anything else is admitted', async () => {
    const { ask } = setup();
    const full = { location: delhi, household: [adult], activities: [commute] };
    const thanks = await ask('thanks', full);
    expect(thanks.reply).toContain("You're welcome");
    const lost = await ask('that helps a lot', full);
    expect(lost.reply).toContain("Sorry, I didn't catch that.");
    for (const turn of [thanks, lost]) {
      expect(turn.plan).not.toBeNull();
      expect(turn.profile.location).toEqual(delhi);
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

  it('the child follow-up chip leaves the household alone and answers about 5 pm', async () => {
    const { ask, geocode } = setup();
    const full = { location: delhi, household: [adult], activities: [commute] };
    const turn = await ask('Can my child play outside at 5?', full);
    expect(turn.profile.household).toEqual([adult]);
    expect(turn.plan?.sensitive).toBe(false);
    expect(turn.reply).toContain('5 pm');
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
    expect(turn.reply).toContain('assuming your daily trip is 10 km, leaving at 9:00');
    const kept = await ask('Metro', { location: delhi, household: [adult], activities: [commute] });
    expect(kept.reply).not.toContain('assuming');
  });
});

describe('city inside a sentence (no key)', () => {
  const cities: Record<string, Location> = {
    Pune: pune,
    Delhi: delhi,
    Mumbai: mumbai,
    Kolkata: { city: 'Kolkata', state: 'West Bengal', lat: 22.57, lon: 88.36 },
    Lucknow: { city: 'Lucknow', state: 'Uttar Pradesh', lat: 26.85, lon: 80.95 },
  };
  const make = () => {
    const geocode = vi.fn((q: string) => Promise.resolve(cities[q] ? [cities[q]] : []));
    const assistant = createDegradedAssistant({
      geocode,
      air: { getAir: () => Promise.resolve({ air, forecast }) },
    });
    const ask = (text: string, profile: Profile = empty, lang: 'en' | 'hi' = 'en') =>
      assistant({ messages: [{ role: 'user', text }], profile, lang, now });
    return { geocode, ask };
  };
  const tr = (key: string, lang: 'en' | 'hi') => t(key, {}, lang);

  it.each([
    ['try.1', 'Pune'],
    ['try.2', 'Delhi'],
    ['try.3', 'Mumbai'],
  ])('%s resolves %s in English and Hindi', async (key, city) => {
    for (const lang of ['en', 'hi'] as const) {
      const turn = await make().ask(tr(key, lang), empty, lang);
      expect(turn.profile.location?.city).toBe(city);
    }
  });

  it('try.4 names Kolkata in English and Lucknow in Hindi', async () => {
    const en = await make().ask(tr('try.4', 'en'));
    const hi = await make().ask(tr('try.4', 'hi'), empty, 'hi');
    expect([en.profile.location?.city, hi.profile.location?.city]).toEqual(['Kolkata', 'Lucknow']);
  });

  it.each(['try.5', 'try.6'])('%s with no location asks for the city', async (key) => {
    for (const lang of ['en', 'hi'] as const) {
      const { ask, geocode } = make();
      const turn = await ask(tr(key, lang), empty, lang);
      expect(turn.reply).toBe(tr('reply.askLocation', lang));
      expect(geocode).not.toHaveBeenCalled();
    }
  });

  it('one sentence gives the city, a sensitive member and a cycle commute', async () => {
    const turn = await make().ask(tr('try.1', 'en'));
    expect(turn.profile.location?.city).toBe('Pune');
    expect(turn.profile.household.some((m) => m.group === 'elderly' && m.respiratory)).toBe(true);
    expect(turn.profile.activities.some((a) => a.kind === 'commute' && a.mode === 'cycle')).toBe(
      true,
    );
    expect(turn.reply).toContain('Pune');
    expect(turn.reply.toLowerCase()).toContain('asthma');
  });

  it('with Delhi set, "we walk in the park" does not switch city or search', async () => {
    const { ask, geocode } = make();
    const turn = await ask('we walk in the park', { ...empty, location: delhi });
    expect(turn.profile.location).toEqual(delhi);
    expect(geocode).not.toHaveBeenCalled();
  });

  it('with Delhi set, a sentence naming Mumbai switches', async () => {
    const turn = await make().ask('How is the air in Mumbai today?', { ...empty, location: delhi });
    expect(turn.profile.location?.city).toBe('Mumbai');
  });
});

describe('demo script questions (no key)', () => {
  const full = (activities: Profile['activities']): Profile => ({
    location: delhi,
    household: [adult],
    activities,
  });
  const exercise = {
    kind: 'exercise' as const,
    label: 'jog',
    startHour: 18,
    participants: [0],
    flexible: true,
  };
  const run = (text: string, profile: Profile) =>
    createDegradedAssistant({
      geocode: () => Promise.resolve([]),
      air: { getAir: () => Promise.resolve({ air, forecast }) },
    })({ messages: [{ role: 'user', text }], profile, lang: 'en', now });

  it('answers each demo question from the plan, not with the generic ready line', async () => {
    const t1 = await run('What does today look like for us?', full([commute]));
    expect(t1.reply).toContain('Commute at 8:00');
    expect(t1.reply).toContain('At home:');
    expect(t1.profile.activities).toEqual([commute]);
    const t2 = await run(
      'Which swap would help us the most?',
      full([{ ...commute, mode: 'petrolCar' }]),
    );
    expect(t2.reply).toContain('Best swap for Commute');
    expect(t2.reply).toContain('% less smog inhaled');
    const t3 = await run('When is the best time for our evening jog?', full([exercise]));
    expect(t3.reply).toMatch(/jog/);
    expect(t3.plan).not.toBeNull();
    const t4 = await run('When should we go for our morning walk?', full([commute]));
    expect(t4.reply).toContain('no walk, jog or play');
    expect(t4.profile.activities).toEqual([commute]);
  });
});
