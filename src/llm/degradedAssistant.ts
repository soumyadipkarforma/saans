import type { createAirService } from '../data/airService';
import type { searchIndia } from '../data/geocode';
import { buildDayPlan } from '../engine/planner';
import { t } from '../i18n/i18n';
import { istNow } from '../time';
import type { AssistantTurn, Lang, Location, Profile } from '../types';
import type { Assistant } from '../chat/useConversation';
import { chipsFor, FOLLOW_UP_CHIPS, parseQuick, templateReply } from './templates';

type AirService = ReturnType<typeof createAirService>;

const label = (l: Location) => (l.state ? `${l.city}, ${l.state}` : l.city);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
// Matches the geocoder's own cap; candidate chips such as "Delhi, National Capital Territory of Delhi" are long.
const MAX_PLACE_CHARS = 80;

// Chip phrases are matched in both languages so a language switch never turns one into a search.
function isFollowUpChip(text: string): boolean {
  return (['en', 'hi'] as Lang[]).some((l) => FOLLOW_UP_CHIPS.some((k) => text === t(k, {}, l)));
}

// A candidate chip reads "City, State" and selects that exact place; plain text is a name search.
async function findPlace(
  geocode: typeof searchIndia,
  text: string,
  exactOnly: boolean,
): Promise<Location[]> {
  const found = await geocode(text.split(',')[0]?.trim() ?? '');
  const chip = found.filter((l) => same(label(l), text));
  if (chip.length > 0) return chip.slice(0, 1);
  if (!exactOnly) return found;
  const name = text.split(',')[0] ?? '';
  return found.filter((l) => same(l.city, name));
}

export function createDegradedAssistant(deps: {
  geocode: typeof searchIndia;
  air: AirService;
}): Assistant {
  return async ({ messages, profile, lang, now }) => {
    const text =
      messages
        .filter((m) => m.role === 'user')
        .at(-1)
        ?.text.trim() ?? '';
    const followUp = isFollowUpChip(text);
    const quick = followUp ? {} : parseQuick(text, profile);
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
      const prefix = followUp ? `${say('reply.followUp')} ` : '';
      const assumed =
        quick.activities && profile.activities.length === 0
          ? ` ${say('reply.assumedCommute')}`
          : '';
      return turn({
        reply: `${prefix}${templateReply(lang, air, plan, location.city)}${assumed}${hint}`,
        chips: chipsFor(next, plan, lang),
        air,
        forecast,
        plan,
      });
    } catch {
      return turn({ reply: say('reply.airUnavailable'), notice: 'airUnavailable' });
    }
  };
}
