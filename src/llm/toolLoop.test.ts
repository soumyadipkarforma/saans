import { describe, expect, it, vi } from 'vitest';
import type { createAirService } from '../data/airService';
import type { AirReading, Forecast, Location, Profile } from '../types';
import type { LlmClient } from './llmClient';
import { systemPrompt } from './systemPrompt';
import { createGeminiAssistant } from './toolLoop';

const delhi: Location = { city: 'Delhi', state: 'Delhi', lat: 28.61, lon: 77.21 };
const mumbai: Location = { city: 'Mumbai', state: 'Maharashtra', lat: 19.07, lon: 72.87 };
const auMh: Location = { city: 'Aurangabad', state: 'Maharashtra', lat: 19.88, lon: 75.34 };
const auBr: Location = { city: 'Aurangabad', state: 'Bihar', lat: 24.75, lon: 84.37 };
const places: Record<string, Location[]> = {
  Delhi: [delhi],
  Mumbai: [mumbai],
  Aurangabad: [auMh, auBr],
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

  it('asks the user to choose when a city is ambiguous, without keeping old data', async () => {
    const { llm } = scripted([
      call('update_profile', { place: 'Aurangabad' }),
      call('get_air_quality'),
    ]);
    const turn = await make(llm)({ messages: user('Aurangabad'), ...base() });
    expect(turn.candidates).toHaveLength(2);
    expect(turn.chips).toEqual(['Aurangabad, Maharashtra', 'Aurangabad, Bihar']);
    expect(turn.air).toBeNull();
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

describe('systemPrompt', () => {
  it('carries the no-invented-numbers rule and the language rule', () => {
    expect(systemPrompt('en')).toContain('Never state any AQI');
    expect(systemPrompt('hi')).toContain('Reply in Hindi');
  });
});
