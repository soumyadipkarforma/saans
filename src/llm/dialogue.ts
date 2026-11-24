import { t } from '../i18n/i18n';
import { minutesSince } from '../time';
import type { AirReading, AssistantTurn, Lang, Member, Profile } from '../types';
import { FOLLOW_UP_CHIPS, HOUSEHOLD_CHIPS, OUTDOOR_CHIPS, TRAVEL_CHIPS } from './templates';

const LANGS: Lang[] = ['en', 'hi'];

export const isChip = (key: string, text: string) => LANGS.some((l) => text === t(key, {}, l));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sameSpot = (a?: Profile['location'], b?: Profile['location']) =>
  a?.lat === b?.lat && a?.lon === b?.lon;

// Two phrasings per sentence, picked by how many messages the user has sent (switching every two): deterministic, no randomness.
function pick(
  lang: Lang,
  key: string,
  turns: number,
  params: Record<string, string | number> = {},
) {
  return t(`${key}.${Math.floor((turns - 1) / 2) % 2}`, params, lang);
}

const describeMember = (m: Member): string =>
  `who.${m.group === 'child' ? 'child' : 'elder'}${m.respiratory ? 'Asthma' : ''}`;
const known = (members: Member[], m: Member) =>
  members.some((o) => o.group === m.group && o.respiratory === m.respiratory);

// One short clause for what this turn understood; empty when nothing changed.
export function acknowledge(i: {
  lang: Lang;
  turns: number;
  text: string;
  before: Profile;
  after: Profile;
}): string {
  const { lang, turns, text, before, after } = i;
  const say = (key: string, p?: Record<string, string | number>) => pick(lang, key, turns, p);
  if (after.location && !sameSpot(before.location, after.location)) {
    return say('ack.city', { city: after.location.city });
  }
  const added = after.household.filter((m) => m.group !== 'adult' && !known(before.household, m));
  if (added.length > 0) {
    const who = added.map((m) => t(describeMember(m), {}, lang)).join(', ');
    return say('ack.member', { who });
  }
  if (before.household.length === 0 && after.household.length > 0) return say('ack.noOne');
  const mode = after.activities.find(
    (a, k) => a.mode && a.mode !== before.activities[k]?.mode,
  )?.mode;
  if (mode) return cap(say('ack.mode', { mode: t(`mode.${mode}`, {}, lang) }));
  const fresh = after.activities.filter((a) => !before.activities.some((b) => b.kind === a.kind));
  const outdoor = fresh.find((a) => a.kind !== 'commute');
  if (outdoor) {
    return say('ack.outdoors', { activity: t(`activity.${outdoor.kind}`, {}, lang).toLowerCase() });
  }
  return isChip('chip.noOutdoors', text) ? say('ack.noOutdoors') : '';
}

// The air line appears for a new city or a changed reading, never as a repeat.
export function airLine(
  lang: Lang,
  air: AirReading,
  city: string,
  now: Date,
  prev: AssistantTurn | null,
  at?: Profile['location'],
): string {
  if (prev?.air && prev.air.aqi === air.aqi && sameSpot(prev.profile.location, at)) return '';
  const min = minutesSince(air.observedAt, now);
  return t(
    'dialogue.air',
    {
      city,
      band: t(`band.${air.band}`, {}, lang),
      aqi: air.aqi,
      source: air.source,
      modelled: t('source.modelled', {}, lang),
      updated: min < 1 ? t('source.justNow', {}, lang) : t('source.updated', { min }, lang),
    },
    lang,
  );
}

// Ask for the first missing slot only (household, travel, outdoors); when none is missing, offer follow-ups.
export function nextStep(i: {
  lang: Lang;
  turns: number;
  profile: Profile;
  prev: AssistantTurn | null;
}): { text: string; chips: string[] } {
  const { lang, turns, profile, prev } = i;
  const asked = prev?.chips.some((c) => isChip('chip.noOutdoors', c)) ?? false;
  const slots: [boolean, string, string[]][] = [
    [profile.household.length === 0, 'ask.household', HOUSEHOLD_CHIPS],
    [!profile.activities.some((a) => a.mode), 'ask.travel', TRAVEL_CHIPS],
    [
      !asked && !profile.activities.some((a) => a.kind !== 'commute'),
      'ask.outdoors',
      OUTDOOR_CHIPS,
    ],
  ];
  const missing = slots.find(([m]) => m);
  const chips = (keys: string[]) => keys.map((k) => t(k, {}, lang));
  return missing
    ? { text: pick(lang, missing[1], turns), chips: chips(missing[2]) }
    : { text: t('dialogue.ready', {}, lang), chips: chips(FOLLOW_UP_CHIPS) };
}
