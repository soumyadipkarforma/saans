import type { AssistantTurn, Profile } from '../types';

const DEVANAGARI_ZERO = 0x0966;
// Pollutant names carry digits that are not readings.
const POLLUTANT = /PM\s?(?:2\.5|10)/gi;
const TIME_12H = /(\d{1,2})(?::\d{2})?\s*(am|pm)\b/gi;

function toAscii(text: string): string {
  return text.replace(/[०-९]/g, (d) =>
    String((d.codePointAt(0) ?? DEVANAGARI_ZERO) - DEVANAGARI_ZERO),
  );
}

// Every number a reader could take as a reading, including the 24-hour form of "5pm".
export function extractNumbers(text: string): number[] {
  const clean = toAscii(text).replace(POLLUTANT, ' ');
  const out = (clean.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  for (const [, h, ap] of clean.matchAll(TIME_12H)) {
    const hour = Number(h) % 12;
    out.push(ap?.toLowerCase() === 'pm' ? hour + 12 : hour);
  }
  return out;
}

function addNumber(set: Set<number>, n: number | null | undefined) {
  if (n === null || n === undefined) return;
  set.add(n);
  set.add(Math.round(n));
  set.add(Math.round(n * 10) / 10);
}

function addHour(set: Set<number>, h: number) {
  set.add(h);
  set.add(h % 12 === 0 ? 12 : h % 12);
}

// Numbers the screen itself shows, plus the user's own details and small counts.
export function allowedNumbers(turn: Partial<AssistantTurn>, profile: Profile): Set<number> {
  const set = new Set<number>();
  for (let n = 0; n <= 10; n++) set.add(n);
  const { air, forecast, plan } = turn;
  if (air) [air.aqi, air.pm25, air.pm10].forEach((n) => addNumber(set, n));
  forecast?.hours.forEach((h) => addNumber(set, h.pm25));
  for (const block of plan?.lowEmissionRoutine ?? []) {
    for (const item of block.items) {
      addHour(set, item.startHour);
      Object.values(item.params).forEach((v) => typeof v === 'number' && addHour(set, v));
    }
  }
  for (const s of plan?.sustainableSwaps ?? []) {
    [s.impact.exposureSavedUg, s.impact.exposureSavedPct, s.impact.co2SavedKg].forEach((n) =>
      addNumber(set, n),
    );
  }
  profile.household.forEach((m) => addNumber(set, m.age));
  set.add(profile.household.length);
  for (const a of profile.activities) {
    [a.distanceKm, a.durationMin, a.occupants].forEach((n) => addNumber(set, n));
    if (a.startHour !== undefined) addHour(set, a.startHour);
  }
  return set;
}

// The caller substitutes the template reply when `guarded` is true.
export function guardReply(
  reply: string,
  allowed: Set<number>,
): { reply: string; guarded: boolean } {
  return { reply, guarded: extractNumbers(reply).some((n) => !allowed.has(n)) };
}
