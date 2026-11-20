import { z } from 'zod';
import type { Location } from '../types';
import { fetchJson } from './http';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const MAX_RESULTS = 5;

const GeocodeSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country_code: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});

// India-only place search. Queries outside 2-80 characters return [] without a network call.
export async function searchIndia(query: string): Promise<Location[]> {
  const q = query.trim();
  if (q.length < 2 || q.length > 80) return [];

  const params = new URLSearchParams({
    name: q,
    count: '10',
    language: 'en',
    format: 'json',
    countryCode: 'IN',
  });
  const body = await fetchJson(`${GEOCODE_URL}?${params.toString()}`, GeocodeSchema);

  const seen = new Set<string>();
  const out: Location[] = [];
  for (const r of body.results ?? []) {
    if (r.country_code !== 'IN') continue;
    const key = `${r.name}|${r.admin1 ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ city: r.name, state: r.admin1, lat: r.latitude, lon: r.longitude });
    if (out.length === MAX_RESULTS) break;
  }
  return out;
}
