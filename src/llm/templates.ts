import { t } from '../i18n/i18n';
import type {
  Activity,
  ActivityKind,
  AirReading,
  DayPlan,
  Lang,
  Member,
  PersonGroup,
  Profile,
  TravelMode,
} from '../types';

// Numbers in the reply come only from the AirReading; the words come from i18n.
export function templateReply(lang: Lang, air: AirReading, plan: DayPlan, city: string): string {
  const key = plan.sensitive ? 'reply.airSensitive' : 'reply.air';
  return t(key, { city, band: t(`band.${air.band}`, {}, lang), aqi: air.aqi }, lang);
}

export const HOUSEHOLD_CHIPS = ['chip.noneSensitive', 'chip.child', 'chip.elder'];
export const TRAVEL_CHIPS = ['chip.car', 'chip.metro', 'chip.bus', 'chip.twoWheeler'];
export const OUTDOOR_CHIPS = ['chip.stroll', 'chip.play', 'chip.schoolRun', 'chip.noOutdoors'];
export const FOLLOW_UP_CHIPS = ['chip.wfh', 'chip.childPlay', 'chip.explain'];

// Ask for the missing slot first (household, then travel); once a plan exists, offer follow-ups.
export function chipsFor(profile: Profile, plan: DayPlan | null, lang: Lang): string[] {
  let keys: string[] = [];
  if (!profile.location) keys = [];
  else if (profile.household.length === 0) keys = HOUSEHOLD_CHIPS;
  else if (profile.activities.length === 0) keys = TRAVEL_CHIPS;
  else if (plan) keys = FOLLOW_UP_CHIPS;
  return keys.map((k) => t(k, {}, lang));
}

// shortcut: keyword matching only, Gemini handles free text; upgrade when the key path is the default.
// "bus" in Hindi also means "enough" and "car" is assumed petrol; accepted for chip phrases.
const MODES: [RegExp, TravelMode][] = [
  [/\bcar\b|कार/i, 'petrolCar'],
  [/\bmetro\b|मेट्रो/i, 'metro'],
  [/\bbus\b|बस/i, 'bus'],
  [/two[- ]?wheeler|\b(?:bike|scooter)\b|दोपहिया/i, 'twoWheeler'],
  [/\bcycl(?:e|es|ing)\b|साइकिल/i, 'cycle'],
  // Walking is travel only when it goes somewhere ("walk to office"); "an evening walk" is an outing.
  [/^walk$|\bwalk(?:s|ing)? to\b|पैदल/i, 'walk'],
];
const OUTDOORS: [RegExp, ActivityKind][] = [
  [/\bstroll|\bwalk|\bjog|exercise|\bpark\b|सैर|टहल/i, 'walk'],
  [/\bplay|खेल/i, 'play'],
  [/school ?run|स्कूल/i, 'schoolRun'],
];
const isTrip = (a: Activity) => a.kind === 'commute' || a.kind === 'schoolRun';
const NO_ONE = /\bno ?one\b|\bnobody\b|कोई.*नहीं/i;
const CHILD = /\bchild|\bkid|\bson\b|\bdaughter|\bbaby|\btoddler|बच्च|बेटा|बेटी/i;
// Parents and grandparents of the person typing count as elders: the cautious choice.
const ELDER =
  /\belder|\bold (?:man|woman|person)|\bgrand|\b(?:mom|mum|mother|dad|father|parents|in-laws|nani|nana|dadi|dada)\b|बुज़ुर्ग|बुजुर्ग|दादा|दादी|नाना|नानी|माँ|पापा|पिता/i;
const ASTHMA = /asthma|अस्थमा/i;

const adult: Member = { group: 'adult', respiratory: false, pregnant: false };
// shortcut: a typical weekday commute when the user names a mode before any activity exists.
const DEFAULT_COMMUTE: Activity = {
  kind: 'commute',
  startHour: 9,
  durationMin: 30,
  distanceKm: 10,
  participants: [0],
  flexible: false,
};

function withMember(members: Member[], group: PersonGroup, respiratory: boolean): Member[] {
  const i = members.findIndex((m) => m.group === group);
  if (i < 0) return [...members, { group, respiratory, pregnant: false }];
  return members.map((m, j) => (j === i && respiratory ? { ...m, respiratory } : m));
}

export function parseQuick(text: string, profile: Profile): Partial<Profile> {
  const out: Partial<Profile> = {};

  if (NO_ONE.test(text)) return { household: [adult] };

  // Clause by clause, so in "mom has asthma and my son is 6" the asthma stays with mom.
  let members = profile.household;
  let found = false;
  for (const part of text.split(/,|;|\.\s|।|\band\b|और/i)) {
    const asthma = ASTHMA.test(part);
    const child = CHILD.test(part);
    const elder = ELDER.test(part) || (asthma && !child);
    if (child) members = withMember(members, 'child', asthma);
    if (elder) members = withMember(members, 'elderly', asthma);
    found ||= child || elder;
  }
  if (found) {
    out.household = members.some((m) => m.group === 'adult') ? members : [adult, ...members];
  }

  let activities = profile.activities;
  const mode = MODES.find(([re]) => re.test(text))?.[1];
  const outdoor = OUTDOORS.filter(
    ([re, kind]) =>
      re.test(text) &&
      !(kind === 'walk' && mode === 'walk') &&
      !activities.some((a) => a.kind === kind),
  ).map(([, kind]): Activity => ({ kind, durationMin: 30, participants: [0], flexible: true }));
  if (outdoor.length > 0) out.activities = activities = [...activities, ...outdoor];

  if (mode) {
    const trips = activities.some(isTrip) ? activities : [...activities, DEFAULT_COMMUTE];
    out.activities = trips.map((a) => (isTrip(a) ? { ...a, mode } : a));
  }
  return out;
}
