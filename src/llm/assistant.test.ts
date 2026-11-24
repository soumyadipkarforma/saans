import { describe, expect, it, vi } from 'vitest';
import type { createAirService } from '../data/airService';
import type { Location } from '../types';
import { createAssistant } from './assistant';
import { LlmError, type LlmClient } from './llmClient';

const delhi: Location = { city: 'Delhi', state: 'Delhi', lat: 28.61, lon: 77.21 };
const air = {
  aqi: 150,
  band: 'poor',
  pm25: 80,
  pm10: 120,
  dominantPollutant: 'pm25',
  source: 'CAMS via Open-Meteo',
  stationOrGrid: 'x',
  observedAt: '2026-11-22T02:00:00.000Z',
  fetchedAt: '2026-11-22T02:00:00.000Z',
  isModelled: true,
  isStale: false,
};
const forecast = { hours: [], source: 'CAMS via Open-Meteo', fetchedAt: air.fetchedAt };
const airService = {
  getAir: () => Promise.resolve({ air, forecast }),
} as unknown as ReturnType<typeof createAirService>;
const geocode = () => Promise.resolve([delhi]);
const input = {
  messages: [{ role: 'user' as const, text: 'Delhi' }],
  profile: { household: [], activities: [] },
  lang: 'en' as const,
  now: new Date('2026-11-22T02:30:00Z'),
};

function setup(llm: LlmClient, key: string | null = 'k'.repeat(30)) {
  let stored = key;
  const keys = {
    get: () => stored,
    clear: vi.fn(() => {
      stored = null;
    }),
  };
  const onKeyInvalid = vi.fn();
  const makeLlm = vi.fn(() => llm);
  let t = 0;
  const assistant = createAssistant({
    geocode,
    air: airService,
    keys,
    onKeyInvalid,
    makeLlm,
    clock: () => t,
  });
  return {
    assistant,
    keys,
    onKeyInvalid,
    makeLlm,
    advance: (ms: number) => {
      t += ms;
    },
  };
}
const says = (text: string): LlmClient => ({
  generate: () => Promise.resolve({ text, calls: [] }),
});
const fails = (code: 'keyInvalid' | 'quota' | 'geminiDown'): LlmClient => ({
  generate: () => Promise.reject(new LlmError(code)),
});

describe('createAssistant', () => {
  it('uses the degraded assistant when there is no key', async () => {
    const { assistant, makeLlm } = setup(says('hi'), null);
    const turn = await assistant(input);
    expect(turn.degraded).toBe(true);
    expect(makeLlm).not.toHaveBeenCalled();
  });

  it('uses Gemini when a key is present', async () => {
    const { assistant } = setup(says('Hello there'));
    const turn = await assistant(input);
    expect(turn.degraded).toBe(false);
    expect(turn.reply).toBe('Hello there');
  });

  it('401: degraded turn with keyInvalid, key cleared, dialog reopened', async () => {
    const { assistant, keys, onKeyInvalid } = setup(fails('keyInvalid'));
    const turn = await assistant(input);
    expect(turn.degraded).toBe(true);
    expect(turn.notice).toBe('keyInvalid');
    expect(keys.clear).toHaveBeenCalled();
    expect(onKeyInvalid).toHaveBeenCalled();
  });

  it('429 and outages become quota and geminiDown notices, key kept', async () => {
    const quota = setup(fails('quota'));
    expect((await quota.assistant(input)).notice).toBe('quota');
    expect(quota.keys.clear).not.toHaveBeenCalled();
    const odd = setup({ generate: () => Promise.reject(new Error('boom')) });
    expect((await odd.assistant(input)).notice).toBe('geminiDown');
  });

  it('the 11th turn within a minute is degraded; the window then slides', async () => {
    const { assistant, advance } = setup(says('Hello there'));
    for (let i = 0; i < 10; i++) expect((await assistant(input)).degraded).toBe(false);
    const limited = await assistant(input);
    expect(limited.degraded).toBe(true);
    expect(limited.notice).toBe('rateLimited');
    advance(61_000);
    expect((await assistant(input)).degraded).toBe(false);
  });
});
