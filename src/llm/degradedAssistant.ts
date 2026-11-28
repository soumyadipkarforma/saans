import type { createAirService } from '../data/airService';
import type { searchIndia } from '../data/geocode';
import { buildDayPlan } from '../engine/planner';
import { t } from '../i18n/i18n';
import { istNow } from '../time';
import type { AssistantTurn, Location, Profile } from '../types';
import type { Assistant } from '../chat/useConversation';
import { findArea, isGreeting, placeName } from './area';
import { acknowledge, airLine, isChip, nextStep } from './dialogue';
import { answerFollowUp, followUpKind } from './followUps';
import { placeCandidates } from './places';
import { answerPlanIntent, planIntent } from './planAnswers';
import { chipsFor, FOLLOW_UP_CHIPS, parseQuick } from './templates';

type AirService = ReturnType<typeof createAirService>;

export const label = (l: Location) => (l.state ? `${l.city}, ${l.state}` : l.city);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
// Matches the geocoder's own cap; candidate chips such as "Delhi, National Capital Territory of Delhi" are long.
const MAX_PLACE_CHARS = 80;

// A candidate chip reads "City, State" and selects that exact place; plain text is a name search.
export async function findPlace(
  geocode: typeof searchIndia,
  text: string,
  exactOnly: boolean,
): Promise<Location[]> {
  const found = await geocode(text.split(',')[0]?.trim() ?? '');
  const chip = found.filter((l) => same(label(l), text));
  if (chip.length > 0) return chip.slice(0, 1);
  const name = text.split(',')[0] ?? '';
  const exact = found.filter((l) => same(l.city, name));
  // The geocoder ranks by size, so "Delhi" means the capital, not a village of the same name.
  // Someone who meant the other one can say "Delhi, Madhya Pradesh".
  if (exact.length > 0 || exactOnly) return exact.slice(0, 1);
  return found;
}

export function createDegradedAssistant(deps: {
  geocode: typeof searchIndia;
  air: AirService;
}): Assistant {
  return async ({ messages, profile, lang, now, prev = null }) => {
    const text =
      messages
        .filter((m) => m.role === 'user')
        .at(-1)
        ?.text.trim() ?? '';
    const turns = messages.filter((m) => m.role === 'user').length;
    const kind = followUpKind(text);
    const intent = planIntent(text);
    const followUp = kind !== null || isChip('chip.noOutdoors', text);
    const quick = kind || intent ? {} : parseQuick(text, profile);
    const hasQuick = Object.keys(quick).length > 0;
    let next: Profile = { ...profile, ...quick };
    const say = (key: string) => t(key, {}, lang);
    const turn = (over: Partial<AssistantTurn>): AssistantTurn => ({
      reply: '',
      chips: chipsFor(next, null, lang),
      profile: next,
      air: null,
      forecast: null,
      plan: null,
      candidates: [],
      degraded: true,
      guarded: false,
      ...over,
    });

    let hint = '';
    const greeting = isGreeting(text);
    if (greeting && !profile.location) return turn({ reply: say('reply.greet') });

    // Right after the city, Saans asks which part of it; the answer moves the reading to that area.
    let areaAck = '';
    let areaTried = false;
    const areaAsked =
      profile.location?.area === undefined &&
      (prev?.chips.some((c) => isChip('chip.skipArea', c)) ?? false);
    const city = profile.location;
    if (areaAsked && city) {
      if (isChip('chip.skipArea', text)) {
        next = { ...next, location: { ...city, area: '' } };
        areaAck = t('ack.areaSkip', { city: city.city }, lang);
      } else if (!kind && !intent) {
        const short = text.split(/\s+/).length <= 4 && !hasQuick;
        const queries = [...(short ? [text] : []), ...placeCandidates(text)];
        for (const q of queries) {
          areaTried = true;
          const hit = await findArea(deps.geocode, q, city).catch(() => null);
          if (hit) {
            next = { ...next, location: hit };
            areaAck = t('ack.area', { area: hit.area ?? '' }, lang);
            break;
          }
        }
      }
    }

    // A city can sit inside a sentence, so try named places first, then the whole text if it is a bare name or "City, State".
    const mayBePlace = text !== '' && !followUp && intent === null && !greeting && !areaAck;
    const words = text.split(/\s+/).length;
    const labelLike =
      text.includes(',') && (text.split(',')[0] ?? '').trim().split(/\s+/).length <= 3;
    const bare = text.length <= MAX_PLACE_CHARS && ((words <= 3 && !hasQuick) || labelLike);
    const tries: [string, boolean][] = [
      ...placeCandidates(text).map((c): [string, boolean] => [c, true]),
    ];
    if (bare) tries.splice(labelLike ? 0 : tries.length, 0, [text, false]);
    if (mayBePlace && (tries.length > 0 || (!hasQuick && profile.location))) {
      // With a city already set, only an exact city-name hit switches it; anything else is chat.
      const current = profile.location;
      let found: Location[] = [];
      let failed = false;
      try {
        for (const [query, exactOnly] of tries) {
          found = await findPlace(deps.geocode, query, exactOnly || current !== undefined);
          if (found.length > 0) break;
        }
      } catch {
        failed = true;
      }
      if (current) {
        const stay = found.some((l) => l.lat === current.lat && l.lon === current.lon);
        if (found.length === 1 && !stay) next = { ...next, location: found[0] };
        else if (found.length > 1 && !stay) {
          return turn({ reply: say('reply.pickCity'), chips: found.map(label), candidates: found });
        } else if (found.length === 0 || failed) hint = ` ${say('reply.changeCity')}`;
      } else {
        if (failed) return turn({ reply: say('reply.airUnavailable'), notice: 'airUnavailable' });
        if (found.length === 0 && !hasQuick) return turn({ reply: say('reply.notFound') });
        if (found.length > 1) {
          return turn({ reply: say('reply.pickCity'), chips: found.map(label), candidates: found });
        }
        if (found.length === 1) next = { ...next, location: found[0] };
      }
    }

    // An unanswered area question is asked once: whatever came back, the whole city is used from here on.
    if (areaAsked && next.location === profile.location && city) {
      next = { ...next, location: { ...city, area: '' } };
      if (areaTried) {
        areaAck = t('ack.areaMissing', { city: city.city }, lang);
        hint = '';
      }
    }

    const location = next.location;
    if (!location) return turn({ reply: say('reply.askLocation') });

    try {
      const { air, forecast } = await deps.air.getAir(location, now);
      // With no household yet the plan assumes one adult, so at-home tips and the AQI still show.
      const planProfile =
        next.household.length > 0
          ? next
          : {
              ...next,
              household: [{ group: 'adult' as const, respiratory: false, pregnant: false }],
            };
      const plan = buildDayPlan({ profile: planProfile, air, forecast, now: istNow(now) });
      const assumed =
        quick.activities?.some((a) => a.kind === 'commute' && a.mode) &&
        !profile.activities.some((a) => a.kind === 'commute')
          ? ` ${say('reply.assumedCommute')}`
          : '';
      if (kind) {
        const r = answerFollowUp(kind, {
          lang,
          city: placeName(location),
          air,
          forecast,
          profile: next,
          now: istNow(now),
        });
        return turn({
          reply: `${r.reply}${hint}`,
          chips: FOLLOW_UP_CHIPS.map(say),
          air,
          forecast,
          plan: r.plan ?? plan,
        });
      }
      if (intent) {
        const reply = answerPlanIntent(intent, { lang, plan, profile: planProfile, text });
        return turn({ reply, chips: FOLLOW_UP_CHIPS.map(say), air, forecast, plan });
      }
      // A sentence can give a city and more; the city clause comes first, then what else was understood.
      const cityNew = next.location !== profile.location;
      const step = nextStep({ lang, turns, profile: next, prev, askArea: cityNew });
      const parts = [
        greeting ? say('reply.greetBack') : '',
        areaAck || acknowledge({ lang, turns, text, before: profile, after: next }),
        cityNew && hasQuick
          ? acknowledge({
              lang,
              turns,
              text,
              before: { ...profile, location: next.location },
              after: next,
            })
          : '',
        airLine(lang, air, placeName(location), now, prev, location),
        step.text,
      ];
      return turn({
        reply: `${parts.filter(Boolean).join(' ')}${assumed}${hint}`,
        chips: step.chips,
        air,
        forecast,
        plan,
      });
    } catch {
      return turn({ reply: say('reply.airUnavailable'), notice: 'airUnavailable' });
    }
  };
}
