process.env.TZ = 'UTC';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Location } from '../types';
import { createAirService } from './airService';
import { TtlCache } from './cache';
import { fetchAirAndForecast } from './openMeteo';

const fixtures = import.meta.glob<unknown>('./fixtures/*.json', { eager: true, import: 'default' });

const DELHI: Location = { city: 'Delhi', state: 'Delhi', lat: 28.61, lon: 77.21 };
const NEAR_DELHI: Location = { ...DELHI, lat: 28.6141, lon: 77.2088 };
const NOW = new Date('2026-11-20T17:34:00Z');

function stubFetchWithFixture() {
  const body = fixtures['./fixtures/air-delhi.json'];
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

async function sampleResult() {
  stubFetchWithFixture();
  return fetchAirAndForecast(DELHI, NOW);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAirService', () => {
  it('serves a repeat lookup within 10 minutes from the cache', async () => {
    const value = await sampleResult();
    let clock = 0;
    const fetcher = vi.fn(() => Promise.resolve(value));
    const service = createAirService(fetcher, new TtlCache(600_000, () => clock));

    await service.getAir(DELHI, NOW);
    clock = 599_999;
    await service.getAir(DELHI, NOW);
    expect(fetcher).toHaveBeenCalledTimes(1);

    clock = 600_000;
    await service.getAir(DELHI, NOW);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('shares one cache entry for coordinates that round to the same 2 decimals', async () => {
    const value = await sampleResult();
    const fetcher = vi.fn(() => Promise.resolve(value));
    const service = createAirService(fetcher, new TtlCache(600_000, () => 0));

    await service.getAir(DELHI, NOW);
    await service.getAir(NEAR_DELHI, NOW);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed lookup', async () => {
    const value = await sampleResult();
    const fetcher = vi
      .fn<() => Promise<typeof value>>()
      .mockRejectedValueOnce(new Error('upstream down'))
      .mockResolvedValueOnce(value);
    const service = createAirService(fetcher, new TtlCache(600_000, () => 0));

    await expect(service.getAir(DELHI, NOW)).rejects.toThrow('upstream down');
    await expect(service.getAir(DELHI, NOW)).resolves.toBe(value);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses the Open-Meteo fetcher and a 10-minute cache by default', async () => {
    const fetchMock = stubFetchWithFixture();
    const service = createAirService();

    const { air } = await service.getAir(DELHI, NOW);
    await service.getAir(DELHI, NOW);

    expect(air.source).toBe('CAMS via Open-Meteo');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
