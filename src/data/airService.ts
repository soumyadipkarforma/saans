import type { Location } from '../types';
import { coordKey, TtlCache } from './cache';
import { type AirAndForecast, fetchAirAndForecast } from './openMeteo';

export { AirUnavailableError } from './openMeteo';

const CACHE_TTL_MS = 600_000;

export type AirFetcher = (loc: Location, now: Date) => Promise<AirAndForecast>;

// Cached per coordinate (2 dp). Failures are not cached, so the next call retries upstream.
export function createAirService(
  fetcher: AirFetcher = fetchAirAndForecast,
  cache: TtlCache<AirAndForecast> = new TtlCache<AirAndForecast>(CACHE_TTL_MS),
) {
  return {
    async getAir(loc: Location, now: Date): Promise<AirAndForecast> {
      const key = coordKey(loc.lat, loc.lon);
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const fresh = await fetcher(loc, now);
      cache.set(key, fresh);
      return fresh;
    },
  };
}
