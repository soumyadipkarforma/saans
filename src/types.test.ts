import { describe, expect, it } from 'vitest';
import {
  ActivitySchema,
  AirReadingSchema,
  AssistantTurnSchema,
  ChatMessageSchema,
  DayPlanSchema,
  ForecastSchema,
  LangSchema,
  LocationSchema,
  MemberSchema,
  PlanBlockSchema,
  PlanItemSchema,
  ProfileSchema,
  SwapSchema,
  TipSchema,
  TravelModeSchema,
  AqiBandSchema,
} from './types';

const location = { city: 'Delhi', area: 'Dwarka', state: 'Delhi', lat: 28.59, lon: 77.05 };
const member = { group: 'child', age: 7, respiratory: true, pregnant: false };
const activity = {
  kind: 'schoolRun',
  label: 'School run',
  startHour: 7,
  durationMin: 25,
  distanceKm: 3,
  mode: 'cngAuto',
  participants: [0],
  flexible: false,
  occupants: 1,
};
const impact = { exposureSavedUg: 120, exposureSavedPct: 35, co2SavedKg: 0.8 };
const swap = {
  activityIndex: 0,
  fromMode: 'cngAuto',
  toMode: 'metro',
  impact,
  whyKey: 'swap.why.metro',
  why: 'Less road exposure',
};
const planItem = {
  activityIndex: 0,
  startHour: 7,
  adviceKey: 'advice.schoolRun',
  reasonKey: 'reason.pm25',
  params: { pm25: 62, minutes: 15 },
};
const planBlock = { period: 'morning', items: [planItem] };
const dayPlan = {
  lowEmissionRoutine: [planBlock],
  sustainableSwaps: [swap],
  indoorAirTips: [{ key: 'tip.ventilate', params: {} }],
  sensitive: false,
};
const air = {
  aqi: 142,
  band: 'moderate',
  pm25: 62.5,
  pm10: 110.2,
  dominantPollutant: 'pm25',
  source: 'CAMS via Open-Meteo',
  stationOrGrid: 'CAMS grid 28.6N 77.0E',
  observedAt: '2026-11-20T08:00:00+05:30',
  fetchedAt: '2026-11-20T08:05:00+05:30',
  isModelled: true,
  isStale: false,
};
const forecast = {
  hours: [
    { time: '2026-11-20T09:00', pm25: 70.1 },
    { time: '2026-11-20T10:00', pm25: null },
  ],
  source: 'CAMS via Open-Meteo',
  fetchedAt: '2026-11-20T08:05:00+05:30',
};
const profile = { location, household: [member], activities: [activity] };

describe('schemas accept valid samples', () => {
  it.each([
    ['Lang', LangSchema, 'hi'],
    ['AqiBand', AqiBandSchema, 'severe'],
    ['Location', LocationSchema, location],
    ['AirReading', AirReadingSchema, air],
    ['Forecast', ForecastSchema, forecast],
    ['Member', MemberSchema, member],
    ['TravelMode', TravelModeSchema, 'bus'],
    ['Activity', ActivitySchema, activity],
    ['Profile', ProfileSchema, profile],
    ['Swap', SwapSchema, swap],
    ['PlanItem', PlanItemSchema, planItem],
    ['PlanBlock', PlanBlockSchema, planBlock],
    ['Tip', TipSchema, { key: 'tip.ventilate', params: {} }],
    ['DayPlan', DayPlanSchema, dayPlan],
    ['ChatMessage', ChatMessageSchema, { role: 'user', text: 'Is the air safe today?' }],
    [
      'AssistantTurn',
      AssistantTurnSchema,
      {
        reply: 'The air is moderate today.',
        chips: ['Today', 'Tomorrow'],
        profile,
        air,
        forecast,
        plan: dayPlan,
        candidates: [location],
        degraded: false,
        guarded: false,
      },
    ],
  ])('%s parses a valid sample', (_name, schema, sample) => {
    expect(schema.safeParse(sample).success).toBe(true);
  });

  it('AssistantTurn accepts null air, forecast and plan with a notice', () => {
    const turn = {
      reply: 'Live air data is unavailable right now.',
      chips: [],
      profile: { household: [], activities: [] },
      air: null,
      forecast: null,
      plan: null,
      candidates: [],
      degraded: true,
      guarded: false,
      notice: 'airUnavailable',
    };
    expect(AssistantTurnSchema.safeParse(turn).success).toBe(true);
  });
});

describe('schemas reject invalid input', () => {
  it('rejects a chat message longer than 500 characters', () => {
    const result = ChatMessageSchema.safeParse({ role: 'user', text: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts a chat message of exactly 500 characters', () => {
    const result = ChatMessageSchema.safeParse({ role: 'user', text: 'a'.repeat(500) });
    expect(result.success).toBe(true);
  });

  it('rejects an empty chat message', () => {
    const result = ChatMessageSchema.safeParse({ role: 'user', text: '' });
    expect(result.success).toBe(false);
  });

  it('rejects London coordinates as a Location', () => {
    const result = LocationSchema.safeParse({ city: 'London', lat: 51.5, lon: -0.12 });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown travel mode', () => {
    expect(TravelModeSchema.safeParse('helicopter').success).toBe(false);
  });

  it('rejects a household of 11 members', () => {
    const household = Array.from({ length: 11 }, () => member);
    const result = ProfileSchema.safeParse({ household, activities: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a start hour outside 0 to 23', () => {
    expect(ActivitySchema.safeParse({ ...activity, startHour: 24 }).success).toBe(false);
  });
});
