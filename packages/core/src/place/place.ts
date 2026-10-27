import { z } from 'zod';

import { locationSchema } from '../geo';
import { weeklyHoursSchema } from '../hours';

export const placeTypes = ['coffee', 'cafe', 'rest', 'bar'] as const;

export const placeTypeSchema = z.enum(placeTypes);

export const placeTypeLabel: Record<z.infer<typeof placeTypeSchema>, string> = {
  coffee: 'Кофейня',
  cafe: 'Кафе',
  rest: 'Ресторан',
  bar: 'Бар',
};

export const placeMetroSchema = z.object({
  name: z.string().min(1),
  distanceM: z.number().nonnegative(),
});

export const placeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: placeTypeSchema,
  address: z.string().min(1),
  metro: placeMetroSchema,
  location: locationSchema,
  hours: weeklyHoursSchema.nullable(),
  avgCheck: z.number().positive().nullable(),
  yandexOrgId: z.string().min(1).nullable(),
});

export type PlaceType = z.infer<typeof placeTypeSchema>;
export type PlaceMetro = z.infer<typeof placeMetroSchema>;
export type Place = z.infer<typeof placeSchema>;
