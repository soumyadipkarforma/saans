import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchIndia } from './geocode';
import { UpstreamError } from './http';

const fixtures = import.meta.glob<unknown>('./fixtures/*.json', { eager: true, import: 'default' });

function fixture(name: string): unknown {
  const value = fixtures[`./fixtures/${name}`];
  if (value === undefined) throw new Error(`missing fixture ${name}`);
  return value;
}

function stubFetchWith(body: unknown) {
  const fn = vi.fn<typeof fetch>(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as unknown as Response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchIndia', () => {
  it('queries Open-Meteo restricted to India and keeps distinct states for Aurangabad', async () => {
    const fetchMock = stubFetchWith(fixture('geocode-aurangabad.json'));

    const results = await searchIndia('Aurangabad');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('geocoding-api.open-meteo.com/v1/search?'),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('name=Aurangabad'),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('countryCode=IN'),
      expect.anything(),
    );
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results[0]).toEqual({
      city: 'Aurangabad',
      state: 'Maharashtra',
      lat: 19.87757,
      lon: 75.34226,
    });
    const states = results.map((r) => r.state);
    expect(new Set(states).size).toBe(states.length);
    expect(states).toContain('Bihar');
  });

  it('returns an empty list when the search has no Indian matches', async () => {
    stubFetchWith(fixture('geocode-london.json'));
    await expect(searchIndia('London')).resolves.toEqual([]);
  });

  it('drops non-Indian matches and dedupes by name and state', async () => {
    stubFetchWith(fixture('geocode-delhi.json'));
    const results = await searchIndia('Delhi');
    expect(results.map((r) => r.city)).toEqual(['Delhi', 'Delhi Cantonment']);
    expect(results.every((r) => r.state === 'Delhi')).toBe(true);
  });

  it('keeps an Indian result that has no state name', async () => {
    stubFetchWith({
      results: [{ name: 'Kotli', latitude: 33.5, longitude: 74.2, country_code: 'IN' }],
    });
    await expect(searchIndia('Kotli')).resolves.toEqual([
      { city: 'Kotli', state: undefined, lat: 33.5, lon: 74.2 },
    ]);
  });

  it('caps the list at five results', async () => {
    const states = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    stubFetchWith({
      results: states.map((s, i) => ({
        name: 'Town',
        latitude: 20 + i,
        longitude: 78,
        country_code: 'IN',
        admin1: s,
      })),
    });
    const results = await searchIndia('Town');
    expect(results).toHaveLength(5);
  });

  it('rejects queries shorter than 2 or longer than 80 characters without fetching', async () => {
    const fetchMock = stubFetchWith(fixture('geocode-london.json'));
    await expect(searchIndia('a')).resolves.toEqual([]);
    await expect(searchIndia('   a  ')).resolves.toEqual([]);
    await expect(searchIndia('x'.repeat(81))).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets an upstream failure propagate as UpstreamError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const err = await searchIndia('Delhi').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).kind).toBe('network');
  });
});
