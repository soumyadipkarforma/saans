import type { Assistant } from '../chat/useConversation';
import type { createAirService } from '../data/airService';
import type { searchIndia } from '../data/geocode';
import { computeSwapImpact } from '../engine/impact';
import { buildDayPlan } from '../engine/planner';
import { t } from '../i18n/i18n';
import { istNow } from '../time';
import {
  ProfileSchema,
  type AirReading,
  type AssistantTurn,
  type DayPlan,
  type Forecast,
  type Location,
  type Profile,
} from '../types';
import { findPlace, label } from './degradedAssistant';
import type { LlmClient } from './llmClient';
import { systemPrompt } from './systemPrompt';
import { chipsFor, FOLLOW_UP_CHIPS, templateReply } from './templates';
import { SwapArgs, toolDeclarations, UpdateProfileArgs } from './tools';

type AirService = ReturnType<typeof createAirService>;
const MAX_ITERATIONS = 5;
const FORECAST_HOURS = 12;
const adult = { group: 'adult' as const, respiratory: false, pregnant: false };

export function createGeminiAssistant(deps: {
  llm: LlmClient;
  geocode: typeof searchIndia;
  air: AirService;
}): Assistant {
  return async ({ messages, profile, lang, now }) => {
    let next: Profile = profile;
    let air: AirReading | null = null;
    let forecast: Forecast | null = null;
    let plan: DayPlan | null = null;
    let candidates: Location[] = [];
    const say = (key: string) => t(key, {}, lang);

    const turn = (over: Partial<AssistantTurn>): AssistantTurn => {
      let chips = chipsFor(next, plan, lang);
      // A follow-up answered in words has no plan of its own; keep offering follow-ups.
      if (chips.length === 0 && next.location && next.household.length && next.activities.length) {
        chips = FOLLOW_UP_CHIPS.map((k) => t(k, {}, lang));
      }
      return {
        reply: '',
        chips,
        profile: next,
        air,
        forecast,
        plan,
        candidates,
        degraded: false,
        guarded: false,
        ...over,
      };
    };

    async function loadAir(loc: Location) {
      if (air) return air;
      const got = await deps.air.getAir(loc, now);
      air = got.air;
      forecast = got.forecast;
      return air;
    }

    function makePlan(a: AirReading, f: Forecast | null): DayPlan {
      const planProfile = next.household.length ? next : { ...next, household: [adult] };
      return buildDayPlan({ profile: planProfile, air: a, forecast: f, now: istNow(now) });
    }

    // Returns the tool result for the model; throws only for a place that needs the user to choose.
    async function run(name: string, args: unknown): Promise<Record<string, unknown>> {
      const fail = (error: string) => ({ error });
      if (name === 'update_profile') {
        const parsed = UpdateProfileArgs.safeParse(args);
        if (!parsed.success) return fail('Invalid arguments for update_profile.');
        const { place, household, activities } = parsed.data;
        const checked = ProfileSchema.safeParse({
          ...next,
          ...(household && { household }),
          ...(activities && { activities }),
        });
        if (!checked.success) return fail('Profile is not valid.');
        let draft: Profile = checked.data;
        let result: Record<string, unknown> = { ok: true };
        if (place) {
          let found: Location[] = [];
          try {
            found = await findPlace(deps.geocode, place, next.location !== undefined);
          } catch {
            return fail('Place lookup failed; ask the user to try again.');
          }
          const current = next.location;
          const stay = found.some((l) => l.lat === current?.lat && l.lon === current?.lon);
          if (found.length > 1 && !stay) {
            candidates = found;
            return { ok: false, ambiguous: found.map(label) };
          }
          if (found.length === 0) result = { ok: false, error: 'Place not found in India.' };
          else if (found.length === 1 && !stay) {
            // A new city never keeps the old city's data.
            draft = { ...draft, location: found[0] };
            air = null;
            forecast = null;
            plan = null;
          }
        }
        next = draft;
        return result;
      }

      if (name === 'compute_swap_impact') {
        const parsed = SwapArgs.safeParse(args);
        if (!parsed.success) return fail('Invalid arguments for compute_swap_impact.');
        if (!next.location) return fail('Location unknown; ask the user for their city.');
        const a = await loadAir(next.location);
        if (a.pm25 === null) return fail('PM2.5 is unavailable.');
        const { personGroup, ...rest } = parsed.data;
        return { ...computeSwapImpact({ ...rest, pm25: a.pm25, group: personGroup }) };
      }

      if (!next.location) return fail('Location unknown; ask the user for their city.');
      const a = await loadAir(next.location);
      if (name === 'get_air_quality') {
        const { aqi, band, pm25, pm10, dominantPollutant, source, observedAt, isStale } = a;
        return {
          aqi,
          band,
          pm25,
          pm10,
          dominantPollutant,
          source,
          observedAt,
          isStale,
          modelled: true,
        };
      }
      if (name === 'get_forecast') {
        const upcoming = (forecast?.hours ?? [])
          .filter((h) => h.time >= istNow(now).slice(0, 13))
          .slice(0, FORECAST_HOURS);
        return { source: forecast?.source, hours: upcoming };
      }
      if (name === 'build_day_plan') {
        plan = makePlan(a, forecast);
        return {
          routine: plan.lowEmissionRoutine.flatMap((b) =>
            b.items.map((i) => ({
              startHour: i.startHour,
              advice: t(i.adviceKey, i.params, lang),
              reason: t(i.reasonKey, i.params, lang),
            })),
          ),
          swaps: plan.sustainableSwaps.map((s) => ({
            from: s.fromMode,
            to: s.toMode,
            ...s.impact,
          })),
          sensitive: plan.sensitive,
        };
      }
      return fail(`Unknown tool ${name}.`);
    }

    const contents: unknown[] = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
    const tools = [{ functionDeclarations: toolDeclarations }];
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const res = await deps.llm.generate({ system: systemPrompt(lang), contents, tools });
      if (res.calls.length === 0) {
        if (res.text) return turn({ reply: res.text });
        break;
      }
      contents.push(
        res.modelContent ?? {
          role: 'model',
          parts: res.calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
        },
      );
      const parts = [];
      for (const call of res.calls) {
        let response: Record<string, unknown>;
        try {
          response = await run(call.name, call.args);
        } catch {
          response = { error: 'Air data is unavailable right now.' };
        }
        if (candidates.length > 0) {
          return turn({ reply: say('reply.pickCity'), chips: candidates.map(label) });
        }
        parts.push({ functionResponse: { name: call.name, response } });
      }
      contents.push({ role: 'user', parts });
    }

    // Loop exhausted or empty reply: fall back to the template, with the plan if we can build one.
    if (!next.location) return turn({ reply: say('reply.askLocation'), degraded: true });
    if (!air) return turn({ reply: say('reply.airUnavailable'), degraded: true });
    const a: AirReading = air;
    plan ??= makePlan(a, forecast);
    return turn({ reply: templateReply(lang, a, plan, next.location.city), degraded: true });
  };
}
