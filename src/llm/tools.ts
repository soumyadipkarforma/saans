import { z } from 'zod';
import { ActivityKindSchema, PersonGroupSchema, TravelModeSchema } from '../types';

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const bool = { type: 'boolean' } as const;
const enumOf = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
const noArgs = { type: 'object', properties: {} };

export const toolDeclarations = [
  {
    name: 'update_profile',
    description:
      'Record what the user said: place name, household members, activities and travel. Lists replace the old lists.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        place: { ...str, description: 'City name exactly as the user wrote it' },
        area: {
          ...str,
          description: 'Neighbourhood or locality inside the city, exactly as the user said it',
        },
        household: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              group: enumOf(PersonGroupSchema.options),
              age: num,
              respiratory: bool,
              pregnant: bool,
            },
            required: ['group'],
          },
        },
        activities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: enumOf(ActivityKindSchema.options),
              startHour: { ...num, description: '24-hour clock, 0 to 23' },
              durationMin: num,
              distanceKm: num,
              mode: enumOf(TravelModeSchema.options),
              participants: { type: 'array', items: num, description: 'Household indexes' },
              flexible: bool,
            },
            required: ['kind'],
          },
        },
      },
    },
  },
  {
    name: 'get_air_quality',
    description: 'Current air quality at the profile location.',
    parametersJsonSchema: noArgs,
  },
  {
    name: 'get_forecast',
    description: 'Hourly PM2.5 forecast at the profile location.',
    parametersJsonSchema: noArgs,
  },
  {
    name: 'build_day_plan',
    description: 'Build the timed day plan, swaps and indoor tips.',
    parametersJsonSchema: noArgs,
  },
  {
    name: 'compute_swap_impact',
    description: 'Exposure and CO2 saved by switching a trip from one travel mode to another.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        distanceKm: num,
        fromMode: enumOf(TravelModeSchema.options),
        toMode: enumOf([...TravelModeSchema.options, 'carpool']),
        personGroup: enumOf(PersonGroupSchema.options),
      },
      required: ['distanceKm', 'fromMode', 'toMode', 'personGroup'],
    },
  },
];

export const UpdateProfileArgs = z.object({
  place: z.string().optional(),
  area: z.string().max(80).optional(),
  household: z
    .array(
      z.object({
        group: PersonGroupSchema,
        age: z.number().min(0).max(110).optional(),
        respiratory: z.boolean().default(false),
        pregnant: z.boolean().default(false),
      }),
    )
    .max(10)
    .optional(),
  activities: z
    .array(
      z.object({
        kind: ActivityKindSchema,
        startHour: z.number().int().min(0).max(23).optional(),
        durationMin: z.number().positive().max(600).optional(),
        distanceKm: z.number().positive().max(100).optional(),
        mode: TravelModeSchema.optional(),
        participants: z.array(z.number().int().nonnegative()).default([0]),
        flexible: z.boolean().default(false),
      }),
    )
    .max(10)
    .optional(),
});

export const SwapArgs = z.object({
  distanceKm: z.number().positive().max(100),
  fromMode: TravelModeSchema,
  toMode: z.union([TravelModeSchema, z.literal('carpool')]),
  personGroup: PersonGroupSchema,
});
