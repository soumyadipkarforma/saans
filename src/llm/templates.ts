import { t } from '../i18n/i18n';
import type {
  Activity,
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

const HOUSEHOLD_CHIPS = ['chip.noneSensitive', 'chip.child', 'chip.elder'];
const TRAVEL_CHIPS = ['chip.car', 'chip.metro', 'chip.bus', 'chip.twoWheeler'];
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
  [/\bwalk\b|टहल/i, 'walk'],
];
const NO_ONE = /\bno ?one\b|\bnobody\b|कोई.*नहीं/i;
const CHILD = /\bchild|\bkid|बच्च/i;
const ELDER = /\belder|\bold (?:man|woman|person)|बुज़ुर्ग|बुजुर्ग|दादा|दादी/i;
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

  const asthma = ASTHMA.test(text);
  const child = CHILD.test(text);
  const elder = ELDER.test(text) || (asthma && !child);
  if (child || elder) {
    let members = profile.household;
    if (child) members = withMember(members, 'child', asthma);
    if (elder) members = withMember(members, 'elderly', asthma);
    out.household = members.some((m) => m.group === 'adult') ? members : [adult, ...members];
  }

  const mode = MODES.find(([re]) => re.test(text))?.[1];
  if (mode) {
    const base = profile.activities.length > 0 ? profile.activities : [DEFAULT_COMMUTE];
    out.activities = base.map((a) => ({ ...a, mode }));
  }
  return out;
}
