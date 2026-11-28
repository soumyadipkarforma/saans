import { describe, expect, it, vi } from 'vitest';
import type { createAirService } from '../data/airService';
import type { AirReading, Forecast, Location, Profile } from '../types';
import { LlmError, type LlmClient } from './llmClient';
import { systemPrompt } from './systemPrompt';
import { computeSwapImpact } from '../engine/impact';
import { createGeminiAssistant } from './toolLoop';

const delhi: Location = { city: 'Delhi', state: 'Delhi', lat: 28.61, lon: 77.21 };
const mumbai: Location = { city: 'Mumbai', state: 'Maharashtra', lat: 19.07, lon: 72.87 };
const auMh: Location = { city: 'Aurangabad', state: 'Maharashtra', lat: 19.88, lon: 75.34 };
const auBr: Location = { city: 'Aurangabad', state: 'Bihar', lat: 24.75, lon: 84.37 };
const pune: Location = { city: 'Pune', state: 'Maharashtra', lat: 18.52, lon: 73.86 };
const places: Record<string, Location[]> = {
  Pune: [pune, { city: 'Puneta', lat: 25, lon: 85 }, { city: 'Puneir', lat: 24, lon: 84 }],
  Delhi: [delhi],
  Mumbai: [mumbai],
  Aurangabad: [auMh, auBr],
  Nagar: [
    { city: 'Nagar Haveli', state: 'Dadra', lat: 20.1, lon: 73 },
    { city: 'Nagar Kurnool', state: 'Telangana', lat: 16.5, lon: 78.3 },
  ],
};
const geocode = vi.fn((q: string) => Promise.resolve(places[q] ?? []));

const air: AirReading = {
  aqi: 312,
  band: 'veryPoor',
  pm25: 180,
  pm10: 260,
  dominantPollutant: 'pm25',
  source: 'CAMS via Open-Meteo',
  stationOrGrid: 'x',
  observedAt: '2026-11-22T02:00:00.000Z',
  fetchedAt: '2026-11-22T02:00:00.000Z',
  isModelled: true,
  isStale: false,
};
const forecast: Forecast = { hours: [], source: 'CAMS via Open-Meteo', fetchedAt: air.fetchedAt };
const getAir = vi.fn(() => Promise.resolve({ air, forecast }));
const airService = { getAir } as unknown as ReturnType<typeof createAirService>;
const now = new Date('2026-11-22T02:30:00Z');
const empty: Profile = { household: [], activities: [] };

type Step = { text?: string; calls?: { name: string; args: unknown }[] };
function scripted(steps: Step[]) {
  const seen: { contents: unknown[] }[] = [];
  let i = 0;
  const llm: LlmClient = {
    generate: (req) => {
      seen.push({ contents: [...req.contents] });
      const s = steps[Math.min(i++, steps.length - 1)] as Step;
      return Promise.resolve({ text: s.text, calls: s.calls ?? [] });
    },
  };
  return { llm, seen };
}
const user = (text: string) => [{ role: 'user' as const, text }];
const call = (name: string, args: unknown = {}) => ({ calls: [{ name, args }] });
const base = (profile: Profile = empty) => ({ profile, lang: 'en' as const, now });
const make = (llm: LlmClient) => createGeminiAssistant({ llm, geocode, air: airService });

describe('createGeminiAssistant', () => {
  it('runs update_profile then get_air_quality; the turn air is the service reading', async () => {
    const { llm } = scripted([
      call('update_profile', { place: 'Delhi' }),
      call('get_air_quality'),
      { text: 'Air is bad, stay careful.' },
    ]);
    const turn = await make(llm)({ messages: user('Delhi'), ...base() });
    expect(turn.air).toEqual(air);
    expect(turn.profile.location).toEqual(delhi);
    expect(turn.reply).toBe('Air is bad, stay careful.');
    expect(turn.degraded).toBe(false);
  });

  it('builds a plan from the loop and offers follow-up chips', async () => {
    const { llm } = scripted([
      call('update_profile', {
        place: 'Delhi',
        household: [{ group: 'child' }],
        activities: [{ kind: 'commute', startHour: 9, distanceKm: 8, mode: 'petrolCar' }],
      }),
      call('build_day_plan'),
      { text: 'Here is your plan.' },
    ]);
    const turn = await make(llm)({ messages: user('plan'), ...base() });
    expect(turn.plan).not.toBeNull();
    expect(turn.chips).toContain('Explain the AQI');
  });

  it('turns invalid tool args into an error result and keeps looping', async () => {
    const { llm, seen } = scripted([
      call('update_profile', { household: [{ group: 'martian' }] }),
      { text: 'Which city are you in?' },
    ]);
    const turn = await make(llm)({ messages: user('hi'), ...base() });
    expect(turn.reply).toBe('Which city are you in?');
    expect(JSON.stringify(seen[1]?.contents)).toContain('Invalid arguments');
  });

  it('falls back to the template reply after 5 iterations', async () => {
    const { llm } = scripted([call('get_air_quality')]);
    const turn = await make(llm)({
      messages: user('loop'),
      ...base({ ...empty, location: delhi }),
    });
    expect(turn.degraded).toBe(true);
    expect(turn.reply).toContain('312');
    expect(turn.plan).not.toBeNull();
  });

  it('asks the user to choose when a place name matches several cities, without keeping old data', async () => {
    const { llm } = scripted([call('update_profile', { place: 'Nagar' }), call('get_air_quality')]);
    const turn = await make(llm)({ messages: user('Nagar'), ...base() });
    expect(turn.candidates).toHaveLength(2);
    expect(turn.chips).toEqual(['Nagar Haveli, Dadra', 'Nagar Kurnool, Telangana']);
    expect(turn.air).toBeNull();
  });

  it('picks the first of two cities that share an exact name', async () => {
    const { llm } = scripted([call('update_profile', { place: 'Aurangabad' })]);
    const turn = await make(llm)({ messages: user('Aurangabad'), ...base() });
    expect(turn.candidates).toEqual([]);
    expect(turn.profile.location).toEqual(auMh);
  });

  it('switching city drops the old reading and ignores coordinates from the model', async () => {
    const { llm } = scripted([
      call('update_profile', { place: 'Mumbai', lat: 1, lon: 2 }),
      { text: 'Switched.' },
    ]);
    const turn = await make(llm)({
      messages: user('Mumbai'),
      ...base({ ...empty, location: delhi }),
    });
    expect(turn.profile.location).toEqual(mumbai);
    expect(turn.air).toBeNull();
  });

  it('reports tool failures to the model instead of throwing', async () => {
    getAir.mockRejectedValueOnce(new Error('down'));
    const { llm, seen } = scripted([call('get_air_quality'), { text: 'Data unavailable.' }]);
    const turn = await make(llm)({
      messages: user('aqi'),
      ...base({ ...empty, location: delhi }),
    });
    expect(turn.reply).toBe('Data unavailable.');
    expect(JSON.stringify(seen[1]?.contents)).toContain('unavailable');
  });

  it('answers swap questions from the engine', async () => {
    const { llm, seen } = scripted([
      call('compute_swap_impact', {
        distanceKm: 10,
        fromMode: 'petrolCar',
        toMode: 'metro',
        personGroup: 'child',
      }),
      { text: 'Metro helps.' },
    ]);
    await make(llm)({ messages: user('metro?'), ...base({ ...empty, location: delhi }) });
    expect(JSON.stringify(seen[1]?.contents)).toContain('exposureSavedPct');
  });
});

describe('number guard in the loop', () => {
  const withAir = base({ ...empty, location: delhi });
  it('replaces a reply that states a made-up number with the template', async () => {
    const { llm } = scripted([call('get_air_quality'), { text: 'AQI is 999 today.' }]);
    const turn = await make(llm)({ messages: user('aqi'), ...withAir });
    expect(turn.guarded).toBe(true);
    expect(turn.reply).toContain('312');
    expect(turn.reply).not.toContain('999');
    expect(turn.air).toEqual(air);
  });

  it('lets a reply quoting the tool reading through', async () => {
    const { llm } = scripted([call('get_air_quality'), { text: 'AQI is 312, very poor.' }]);
    const turn = await make(llm)({ messages: user('aqi'), ...withAir });
    expect(turn.guarded).toBe(false);
  });

  it('guards Devanagari digits too', async () => {
    const { llm } = scripted([call('get_air_quality'), { text: 'एक्यूआई ९९९ है' }]);
    const turn = await make(llm)({
      messages: user('aqi'),
      lang: 'hi',
      profile: withAir.profile,
      now,
    });
    expect(turn.guarded).toBe(true);
  });

  it('allows a number the swap tool returned', async () => {
    const args = { distanceKm: 10, fromMode: 'petrolCar', toMode: 'metro', personGroup: 'child' };
    const { pct } = {
      pct: computeSwapImpact({
        distanceKm: 10,
        fromMode: 'petrolCar',
        toMode: 'metro',
        pm25: 180,
        group: 'child',
      }).exposureSavedPct,
    };
    const { llm } = scripted([
      call('compute_swap_impact', args),
      { text: `Metro cuts smog inhaled by ${pct}%.` },
    ]);
    const turn = await make(llm)({ messages: user('metro?'), ...withAir });
    expect(turn.guarded).toBe(false);
    expect(turn.reply).toContain(String(pct));
  });
});

describe('hardening', () => {
  const withAir = base({ ...empty, location: delhi });

  it('picks the single exact city without asking', async () => {
    const { llm } = scripted([call('update_profile', { place: 'Pune' }), { text: 'Noted.' }]);
    const turn = await make(llm)({ messages: user('Pune'), ...base() });
    expect(turn.profile.location).toEqual(pune);
    expect(turn.candidates).toEqual([]);
  });

  it('does not let the model launder a number through update_profile', async () => {
    const { llm } = scripted([
      call('update_profile', { activities: [{ kind: 'commute', distanceKm: 77, mode: 'bus' }] }),
      { text: 'That is a 77 km trip.' },
    ]);
    const turn = await make(llm)({ messages: user('I commute'), ...withAir });
    expect(turn.guarded).toBe(true);
  });

  it('a profile value the model set in turn 1 is not allowed in turn 2', async () => {
    const first = scripted([
      call('update_profile', { activities: [{ kind: 'commute', distanceKm: 77, mode: 'bus' }] }),
      { text: 'Noted.' },
    ]);
    const t1 = await make(first.llm)({ messages: user('I commute'), ...withAir });
    expect(t1.profile.activities[0]?.distanceKm).toBe(77);
    const second = scripted([{ text: 'Your 77 km commute is long.' }]);
    const t2 = await make(second.llm)({
      messages: user('any tips?'),
      lang: 'en',
      now,
      profile: t1.profile,
    });
    expect(t2.guarded).toBe(true);
  });

  it('a made-up AQI that matches a scale fact is guarded', async () => {
    const { llm } = scripted([call('get_air_quality'), { text: 'The AQI is 300 right now.' }]);
    expect((await make(llm)({ messages: user('aqi'), ...withAir })).guarded).toBe(true);
  });

  it('allows a number the user wrote, and a spelled-out reading is guarded', async () => {
    const said = scripted([{ text: 'A 14 km trip is fine.' }]);
    expect((await make(said.llm)({ messages: user('my trip is 14 km'), ...withAir })).guarded).toBe(
      false,
    );
    const words = scripted([call('get_air_quality'), { text: 'AQI is two hundred fifty.' }]);
    expect((await make(words.llm)({ messages: user('aqi'), ...withAir })).guarded).toBe(true);
  });

  it('caps tool arguments: a 300 km distance is an invalid-arguments result', async () => {
    const { llm, seen } = scripted([
      call('update_profile', { activities: [{ kind: 'commute', distanceKm: 300 }] }),
      { text: 'Which city?' },
    ]);
    await make(llm)({ messages: user('hi'), ...base() });
    expect(JSON.stringify(seen[1]?.contents)).toContain('Invalid arguments');
  });

  it('gives up when the total time budget runs out', async () => {
    const stuck: LlmClient = {
      generate: (req) =>
        new Promise((_, reject) => {
          req.signal?.addEventListener('abort', () => reject(new LlmError('geminiDown')));
        }),
    };
    const assistant = createGeminiAssistant({ llm: stuck, geocode, air: airService, budgetMs: 20 });
    await expect(assistant({ messages: user('hi'), ...base() })).rejects.toMatchObject({
      code: 'geminiDown',
    });
  });

  it('tells the model what is already known, in words only', () => {
    const prompt = systemPrompt('en', {
      location: delhi,
      household: [{ group: 'child', age: 8, respiratory: true, pregnant: false }],
      activities: [{ kind: 'commute', mode: 'bus', participants: [0], flexible: false }],
    });
    expect(prompt).toContain(
      'Already known: city Delhi; area not asked yet; household child with a lung condition; activities commute by bus.',
    );
    expect(prompt).not.toContain('8');
  });
});

describe('systemPrompt', () => {
  it('carries the no-invented-numbers rule and the language rule', () => {
    expect(systemPrompt('en')).toContain('Never state any AQI');
    expect(systemPrompt('hi')).toContain('Reply in Hindi');
  });
});
