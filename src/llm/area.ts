import type { searchIndia } from '../data/geocode';
import type { Location } from '../types';

// An area must sit this close to the chosen city to count as part of it (Delhi NCR spans about 50 km).
const MAX_AREA_KM = 45;

function km(a: Location, b: Location): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// "Dwarka" inside Delhi resolves to Dwarka, Delhi, not Dwarka in Gujarat: the nearest match to the city wins.
export async function findArea(
  geocode: typeof searchIndia,
  text: string,
  city: Location,
): Promise<Location | null> {
  const found = await geocode(text);
  const near = found
    .map((l) => ({ l, d: km(city, l) }))
    .filter((x) => x.d <= MAX_AREA_KM)
    .sort((x, y) => x.d - y.d);
  const hit = near[0]?.l;
  if (!hit || hit.city.toLowerCase() === city.city.toLowerCase()) return null;
  return { ...city, area: hit.city, lat: hit.lat, lon: hit.lon };
}

// "Dwarka, Delhi" once an area is known, else just the city.
export const placeName = (l: Location) => (l.area ? `${l.area}, ${l.city}` : l.city);

const GREETING =
  /^(hi+|hello+|hey+|hiya|yo|namaste|namaskar|good (morning|afternoon|evening)|नमस्ते|नमस्कार|हेलो|हाय)\b/i;
// A greeting on its own ("hi there", "hello Saans"), not "hi, I live in Pune".
export const isGreeting = (text: string) =>
  GREETING.test(text.trim()) && text.trim().split(/\s+/).length <= 4 && !text.includes(',');
