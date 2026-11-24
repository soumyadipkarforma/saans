import type { AssistantTurn, Profile } from '../types';

// Pollutant names carry digits that are not readings.
const POLLUTANT = /PM\s?(?:2\.5|10)/gi;
const TIME_12H = /(\d{1,2})(?::\d{2})?\s*(am|pm)\b/gi;

// Zero-width characters are dropped and every digit script is mapped to ASCII, so "3<ZWSP>00" is 300.
function toAscii(text: string): string {
  const digit = (zero: number) => (d: string) => String((d.codePointAt(0) ?? zero) - zero);
  return text
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/[०-९]/g, digit(0x0966))
    .replace(/[٠-٩]/g, digit(0x0660))
    .replace(/[۰-۹]/g, digit(0x06f0))
    .replace(/[０-９]/g, digit(0xff10));
}

// Hindi numerals 1 to 99, in order, so any compound such as पचपन or निन्यानवे counts.
const HINDI_UNDER_100 =
  `एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस
इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस
इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ
इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उनासी अस्सी
इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पंचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे`.split(
    /\s+/,
  );

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
    hundreds: 100,
    thousands: 1000,
    lakhs: 100000,
    crores: 10000000,
    ...Object.fromEntries(HINDI_UNDER_100.map((w, i) => [w, i + 1])),
  }).map(([w, v]) => [w.normalize('NFD'), v]),
);

// Rewrites runs of number words that total `minTotal` or more as digits: "three hundred" -> "300".
function spellOut(text: string, minTotal = 11): string {
  const src = text.normalize('NFD').toLowerCase();
  let out = '';
  let copied = 0;
  let run: { start: number; end: number; total: number; current: number } | null = null;
  const flush = () => {
    if (run && run.total + run.current >= minTotal) {
      out += src.slice(copied, run.start) + ` ${run.total + run.current} `;
      copied = run.end;
    }
    run = null;
  };
  for (const m of src.matchAll(/[\p{L}\p{M}]+/gu)) {
    const v = WORD_VALUES[m[0]];
    const start = m.index;
    if (run && /[^\s-]/.test(src.slice(run.end, start))) flush();
    if (v === undefined) {
      flush();
      continue;
    }
    run ??= { start, end: start, total: 0, current: 0 };
    run.end = start + m[0].length;
    if (v < 100) run.current += v;
    else if (v === 100) run.current = (run.current || 1) * 100;
    else {
      run.total += (run.current || 1) * v;
      run.current = 0;
    }
  }
  flush();
  return out + src.slice(copied);
}

// Every number a reader could take as a reading, including the 24-hour form of "5pm".
export function extractNumbers(text: string): number[] {
  const clean = spellOut(toAscii(text)).replace(POLLUTANT, ' ');
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

// Numbers the screen itself shows (this turn's tool and engine output), numbers the user typed
// in the conversation window, timestamp parts and 0 to 10. Scale ranges and band boundaries are not allowed. Nothing the model wrote into the
// profile counts: that would let a value it invented be repeated next turn.
export function allowedNumbers(
  turn: Partial<AssistantTurn>,
  extra: number[] | Profile = [],
): Set<number> {
  // A Profile is accepted for older callers and deliberately ignored.
  const userNumbers = Array.isArray(extra) ? extra : [];
  const set = new Set<number>();
  for (let n = 0; n <= 10; n++) set.add(n);
  userNumbers.forEach((n) => addNumber(set, n));
  const { air, forecast, plan } = turn;
  if (air) [air.observedAt, air.fetchedAt].forEach((iso) => addTimestamp(set, iso));
  if (air) [air.aqi, air.pm25, air.pm10].forEach((n) => addNumber(set, n));
  forecast?.hours.forEach((h) => {
    addNumber(set, h.pm25);
    addHour(set, Number(h.time.slice(11, 13)));
  });
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
  return set;
}

type Readings = {
  aqi: Set<number>;
  pm25: Set<number>;
  pm10: Set<number>;
  /** 24-hour clock hours the turn's timestamps and plan mention. */
  hours: Set<number>;
};

// The only values a reply may attach to the words AQI, PM2.5 and PM10 in this turn.
export function readings(turn: Partial<AssistantTurn>): Readings {
  const r: Readings = { aqi: new Set(), pm25: new Set(), pm10: new Set(), hours: new Set() };
  const { air, forecast, plan } = turn;
  if (air) {
    addNumber(r.aqi, air.aqi);
    addNumber(r.pm25, air.pm25);
    addNumber(r.pm10, air.pm10);
    for (const iso of [air.observedAt, air.fetchedAt]) {
      const ms = Date.parse(iso);
      if (!Number.isNaN(ms)) r.hours.add(new Date(ms + IST_OFFSET_MS).getUTCHours());
    }
  }
  forecast?.hours.forEach((h) => {
    addNumber(r.pm25, h.pm25);
    r.hours.add(Number(h.time.slice(11, 13)));
  });
  plan?.lowEmissionRoutine.forEach((b) => b.items.forEach((i) => r.hours.add(i.startHour)));
  return r;
}

// Labels may carry any punctuation around them ("**AQI**", "(AQI)", "AQI:").
const EDGE = String.raw`[^\p{L}\p{N}]*`;
const label = (core: string) => new RegExp(`^${EDGE}(?:${core})${EDGE}$`, 'u');
// Pollutant names are rewritten to letters so their own digits are never read as numbers.
const LABELS: [RegExp, 'aqi' | 'pm25' | 'pm10'][] = [
  [label('aqi|एक्यूआई'), 'aqi'],
  [label('pmtwofive'), 'pm25'],
  [label('pmten'), 'pm10'],
];
const kindOf = (w: string) => LABELS.find(([re]) => re.test(w))?.[1];
const MERIDIEM = /^(a|p)\.?m\.?\W*$/;
const NUM = String.raw`\d+(?:\.\d+)?`;

// To 24-hour time: "4" + "pm" -> 16.
const to24 = (h: number, pm: boolean) => (h % 12) + (pm ? 12 : 0);

// In a sentence that names AQI, PM2.5 or PM10, every number must be that reading (the nearest
// label before it). Clock times are the only exception, and the hour must come from the turn.
function misattributed(reply: string, facts: Readings): boolean {
  const named = toAscii(reply)
    .replace(/pm\s?2\.5/gi, ' pmtwofive ')
    .replace(/pm\s?10/gi, ' pmten ');
  const sentences = named.split(/[!?।\n]+|\.(?=\s|$)/);
  return sentences.some((raw) => {
    const text = spellOut(raw, 1)
      .replace(/[*_`~#>()[\]{}“”"'‘’=≈→,;]/g, ' ')
      .replace(/(?<!\d):|:(?!\d)/g, ' ');
    const words = text.split(/\s+/).filter(Boolean);
    let current = words.map(kindOf).find((k) => k !== undefined);
    if (!current) return false;
    return words.some((w, i) => {
      const kind = kindOf(w);
      if (kind) {
        current = kind;
        return false;
      }
      const next = words[i + 1] ?? '';
      const clock = w.match(/^(\d{1,2}):(\d{2})$/);
      const suffixed = w.match(/^(\d{1,2})(?::(\d{2}))?(a|p)\.?m\.?\W*$/);
      const spaced = w.match(/^(\d{1,2})$/) && MERIDIEM.exec(next);
      if (clock && !MERIDIEM.test(next)) {
        const h = Number(clock[1]); // no am/pm given: either half of the day may be meant
        return !(facts.hours.has(h) || facts.hours.has((h + 12) % 24));
      }
      if (clock || suffixed || spaced) {
        const h = Number((clock ?? suffixed ?? w.match(/^\d+/))?.[1] ?? w);
        const pm = (suffixed?.[3] ?? MERIDIEM.exec(next)?.[1]) === 'p';
        return !facts.hours.has(to24(h, pm));
      }
      return (w.match(new RegExp(NUM, 'g')) ?? []).some(
        (n) => !facts[current as 'aqi'].has(Number(n)),
      );
    });
  });
}

// The caller substitutes the template reply when `guarded` is true.
export function guardReply(
  reply: string,
  allowed: Set<number>,
  facts?: Readings,
): { reply: string; guarded: boolean } {
  const unknown = extractNumbers(reply).some((n) => !allowed.has(n));
  return { reply, guarded: unknown || (facts !== undefined && misattributed(reply, facts)) };
}
