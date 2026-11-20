import { z } from 'zod';

export const LangSchema = z.enum(['en', 'hi']);
export type Lang = z.infer<typeof LangSchema>;

export const AqiBandSchema = z.enum([
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'veryPoor',
  'severe',
]);
export type AqiBand = z.infer<typeof AqiBandSchema>;

// shortcut: bounding box includes slivers of neighbouring countries, upgrade to a polygon if it matters
export const LocationSchema = z.object({
  city: z.string(),
  area: z.string().optional(),
  state: z.string().optional(),
  lat: z.number().min(6).max(37.6),
  lon: z.number().min(68).max(97.5),
});
export type Location = z.infer<typeof LocationSchema>;

export const AirReadingSchema = z.object({
  aqi: z.number(),
  band: AqiBandSchema,
  pm25: z.number().nullable(),
  pm10: z.number().nullable(),
  dominantPollutant: z.enum(['pm25', 'pm10']),
  source: z.literal('CAMS via Open-Meteo'),
  stationOrGrid: z.string(),
  observedAt: z.string(),
  fetchedAt: z.string(),
  isModelled: z.literal(true),
  isStale: z.boolean(),
});
export type AirReading = z.infer<typeof AirReadingSchema>;

export const ForecastHourSchema = z.object({
  time: z.string(),
  pm25: z.number().nullable(),
});
export type ForecastHour = z.infer<typeof ForecastHourSchema>;

export const ForecastSchema = z.object({
  hours: z.array(ForecastHourSchema),
  source: z.literal('CAMS via Open-Meteo'),
  fetchedAt: z.string(),
});
export type Forecast = z.infer<typeof ForecastSchema>;

export const PersonGroupSchema = z.enum(['child', 'adult', 'elderly']);
export type PersonGroup = z.infer<typeof PersonGroupSchema>;

export const MemberSchema = z.object({
  group: PersonGroupSchema,
  age: z.number().optional(),
  respiratory: z.boolean(),
  pregnant: z.boolean(),
});
export type Member = z.infer<typeof MemberSchema>;

export const TravelModeSchema = z.enum([
  'petrolCar',
  'dieselCar',
  'cngAuto',
  'twoWheeler',
  'bus',
  'metro',
  'walk',
  'cycle',
]);
export type TravelMode = z.infer<typeof TravelModeSchema>;

export const ActivityKindSchema = z.enum([
  'commute',
  'schoolRun',
  'walk',
  'play',
  'exercise',
  'errand',
]);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;

export const ActivitySchema = z.object({
  kind: ActivityKindSchema,
  label: z.string().optional(),
  startHour: z.number().int().min(0).max(23).optional(),
  durationMin: z.number().optional(),
  distanceKm: z.number().optional(),
  mode: TravelModeSchema.optional(),
  participants: z.array(z.number().int().nonnegative()),
  flexible: z.boolean(),
  occupants: z.number().int().optional(),
});
export type Activity = z.infer<typeof ActivitySchema>;

export const ProfileSchema = z.object({
  location: LocationSchema.optional(),
  household: z.array(MemberSchema).max(10),
  activities: z.array(ActivitySchema).max(10),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const SwapImpactSchema = z.object({
  exposureSavedUg: z.number(),
  exposureSavedPct: z.number(),
  co2SavedKg: z.number(),
});
export type SwapImpact = z.infer<typeof SwapImpactSchema>;

export const SwapSchema = z.object({
  activityIndex: z.number().int().nonnegative(),
  fromMode: TravelModeSchema,
  toMode: z.union([TravelModeSchema, z.literal('carpool')]),
  impact: SwapImpactSchema,
  whyKey: z.string(),
  why: z.string().optional(),
});
export type Swap = z.infer<typeof SwapSchema>;

const ParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const PlanItemSchema = z.object({
  activityIndex: z.number().int().nonnegative().nullable(),
  startHour: z.number().int().min(0).max(23),
  adviceKey: z.string(),
  reasonKey: z.string(),
  params: ParamsSchema,
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const PlanBlockSchema = z.object({
  period: z.enum(['morning', 'afternoon', 'evening']),
  items: z.array(PlanItemSchema),
});
export type PlanBlock = z.infer<typeof PlanBlockSchema>;

export const TipSchema = z.object({
  key: z.string(),
  params: ParamsSchema,
});
export type Tip = z.infer<typeof TipSchema>;

export const DayPlanSchema = z.object({
  lowEmissionRoutine: z.array(PlanBlockSchema),
  sustainableSwaps: z.array(SwapSchema),
  indoorAirTips: z.array(TipSchema),
  sensitive: z.boolean(),
});
export type DayPlan = z.infer<typeof DayPlanSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  text: z.string().min(1).max(500),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const AssistantTurnSchema = z.object({
  reply: z.string(),
  chips: z.array(z.string()),
  profile: ProfileSchema,
  air: AirReadingSchema.nullable(),
  forecast: ForecastSchema.nullable(),
  plan: DayPlanSchema.nullable(),
  candidates: z.array(LocationSchema),
  degraded: z.boolean(),
  guarded: z.boolean(),
  notice: z.enum(['keyInvalid', 'quota', 'geminiDown', 'airUnavailable']).optional(),
});
export type AssistantTurn = z.infer<typeof AssistantTurnSchema>;
