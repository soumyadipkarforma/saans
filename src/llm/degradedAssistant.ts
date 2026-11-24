import type { createAirService } from '../data/airService';
import type { searchIndia } from '../data/geocode';
import { buildDayPlan } from '../engine/planner';
import { t } from '../i18n/i18n';
import { istNow } from '../time';
import type { AssistantTurn, Location, Profile } from '../types';
import type { Assistant } from '../chat/useConversation';
import { acknowledge, airLine, isChip, nextStep } from './dialogue';
import { answerFollowUp, followUpKind } from './followUps';
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
  if (exactOnly) return exact;
  // One city with exactly the typed name wins over look-alikes; two (Delhi, Delhi) still need a choice.
  return exact.length === 1 ? exact : found;
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
    const followUp = kind !== null || isChip('chip.noOutdoors', text);
    const quick = kind ? {} : parseQuick(text, profile);
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
    const mayBePlace =
      text !== '' &&
      !followUp &&
      !hasQuick &&
      !text.includes('?') &&
      text.length <= MAX_PLACE_CHARS;
    if (mayBePlace) {
      // With a city already set, only an exact city-name hit switches it; anything else is chat.
      const current = profile.location;
      let found: Location[] = [];
      let failed = false;
      try {
        found = await findPlace(deps.geocode, text, current !== undefined);
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
        if (found.length === 0) return turn({ reply: say('reply.notFound') });
        if (found.length > 1) {
          return turn({ reply: say('reply.pickCity'), chips: found.map(label), candidates: found });
        }
        next = { ...next, location: found[0] };
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
          city: location.city,
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
      const step = nextStep({ lang, turns, profile: next, prev });
      const parts = [
        acknowledge({ lang, turns, text, before: profile, after: next }),
        airLine(lang, air, location.city, now, prev, location),
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
