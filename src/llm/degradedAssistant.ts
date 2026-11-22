import type { createAirService } from '../data/airService';
import type { searchIndia } from '../data/geocode';
import { buildDayPlan } from '../engine/planner';
import { t } from '../i18n/i18n';
import { istNow } from '../time';
import type { AssistantTurn, Location, Profile } from '../types';
import type { Assistant } from '../chat/useConversation';
import { chipsFor, FOLLOW_UP_CHIPS, parseQuick, templateReply } from './templates';

type AirService = ReturnType<typeof createAirService>;

const label = (l: Location) => (l.state ? `${l.city}, ${l.state}` : l.city);

// Looks up "Aurangabad" or a candidate chip "Aurangabad, Bihar" (name before the comma, state after).
async function findPlace(geocode: typeof searchIndia, text: string): Promise<Location[]> {
  const [name = '', state] = text.split(',').map((s) => s.trim());
  const found = await geocode(name);
  const wanted = state?.toLowerCase();
  const exact = wanted ? found.filter((l) => l.state?.toLowerCase() === wanted) : [];
  return exact.length > 0 ? exact : found;
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
    const quick = parseQuick(text, profile);
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

    const isFollowUp = FOLLOW_UP_CHIPS.some((k) => text === say(k));
    const isPlaceQuery =
      text !== '' &&
      !isFollowUp &&
      !text.includes('?') &&
      !('household' in quick || 'activities' in quick);
    if (isPlaceQuery) {
      let found: Location[];
      try {
        found = await findPlace(deps.geocode, text);
      } catch {
        return turn({ reply: say('reply.airUnavailable'), notice: 'airUnavailable' });
      }
      const [only] = found;
      if (!only) return turn({ reply: say('reply.notFound') });
      if (found.length > 1) {
        return turn({
          reply: say('reply.pickCity'),
          chips: found.map(label),
          candidates: found,
        });
      }
      next = { ...next, location: only };
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
      return turn({
        reply: templateReply(lang, air, plan, location.city),
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
