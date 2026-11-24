import { AQI_MAX, PM25_BREAKPOINTS } from '../engine/constants';
import type { AssistantTurn, Profile } from '../types';

const DEVANAGARI_ZERO = 0x0966;
const FULLWIDTH_ZERO = 0xff10;
// Pollutant names carry digits that are not readings.
const POLLUTANT = /PM\s?(?:2\.5|10)/gi;
const TIME_12H = /(\d{1,2})(?::\d{2})?\s*(am|pm)\b/gi;

function toAscii(text: string): string {
  return text
    .replace(/[०-९]/g, (d) => String((d.codePointAt(0) ?? DEVANAGARI_ZERO) - DEVANAGARI_ZERO))
    .replace(/[０-９]/g, (d) => String((d.codePointAt(0) ?? FULLWIDTH_ZERO) - FULLWIDTH_ZERO));
}

// Number words for values of 11 and up count as numbers; one to ten stay free, like small digits.
// Keys are NFD-normalised so Hindi words with a nukta match however they were typed.
const WORD_VALUES: Record<string, number> = Object.fromEntries(
  Object.entries({
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
    hundred: 100,
    thousand: 1000,
    lakh: 100000,
    crore: 10000000,
    एक: 1,
    दो: 2,
    तीन: 3,
    चार: 4,
    पांच: 5,
    पाँच: 5,
    छह: 6,
    छः: 6,
    सात: 7,
    आठ: 8,
    नौ: 9,
    दस: 10,
    ग्यारह: 11,
    बारह: 12,
    तेरह: 13,
    चौदह: 14,
    पंद्रह: 15,
    सोलह: 16,
    सत्रह: 17,
    अठारह: 18,
    उन्नीस: 19,
    बीस: 20,
    तीस: 30,
    चालीस: 40,
    पचास: 50,
    साठ: 60,
    सत्तर: 70,
    अस्सी: 80,
    नब्बे: 90,
    सौ: 100,
    हज़ार: 1000,
    हजार: 1000,
    लाख: 100000,
    करोड़: 10000000,
  }).map(([w, v]) => [w.normalize('NFD'), v]),
);

// "three hundred" -> 300, "तीस" -> 30. Only runs that total 11 or more are reported.
function wordNumbers(text: string): number[] {
  const out: number[] = [];
  let total = 0;
  let current = 0;
  let active = false;
  const flush = () => {
    if (active && total + current >= 11) out.push(total + current);
    total = 0;
    current = 0;
    active = false;
  };
  for (const [word] of text
    .normalize('NFD')
    .toLowerCase()
    .matchAll(/[\p{L}\p{M}]+/gu)) {
    const v = WORD_VALUES[word];
    if (v === undefined) {
      flush();
      continue;
    }
    active = true;
    if (v < 100) current += v;
    else if (v === 100) current = (current || 1) * 100;
    else {
      total += (current || 1) * v;
      current = 0;
    }
  }
  flush();
  return out;
}

// Every number a reader could take as a reading, including the 24-hour form of "5pm".
export function extractNumbers(text: string): number[] {
  const clean = toAscii(text).replace(POLLUTANT, ' ');
  const out = [...(clean.match(/\d+(?:\.\d+)?/g) ?? []).map(Number), ...wordNumbers(clean)];
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

// Public CPCB scale facts and the averaging period: the model may explain bands with these.
const SCALE_FACTS = [0, 24, ...PM25_BREAKPOINTS.map(([, aqi]) => aqi), AQI_MAX];
const IST_OFFSET_MS = 330 * 60_000;

// Date and time parts of a reading's timestamps, as an Indian reader sees them (IST).
function addTimestamp(set: Set<number>, iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return;
  const d = new Date(ms + IST_OFFSET_MS);
  [d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear(), d.getUTCMinutes()].forEach((n) =>
    set.add(n),
  );
  addHour(set, d.getUTCHours());
}

// Numbers the screen itself shows, plus the user's own details and small counts.
export function allowedNumbers(turn: Partial<AssistantTurn>, profile: Profile): Set<number> {
  const set = new Set<number>();
  for (let n = 0; n <= 10; n++) set.add(n);
  SCALE_FACTS.forEach((n) => set.add(n));
  const { air, forecast, plan } = turn;
  if (air) [air.observedAt, air.fetchedAt].forEach((iso) => addTimestamp(set, iso));
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
