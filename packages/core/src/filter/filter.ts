import { z } from 'zod';

import { hoursStatus } from '../hours';
import type { Place } from '../place';
import { placeTypeSchema } from '../place';

const MOSCOW_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

export const NEAR_METRO_MAX_DISTANCE_M = 1000;

export const filterHourSchema = z.number().int().min(0).max(23);

export const eveningFilterAtSchema = z.union([z.literal('now'), filterHourSchema]);

export const eveningFilterSchema = z.object({
  at: eveningFilterAtSchema,
  types: z.array(placeTypeSchema),
  maxCheck: z.number().positive().nullable(),
  nearMetro: z.boolean(),
});

export type FilterHour = z.infer<typeof filterHourSchema>;
export type EveningFilterAt = z.infer<typeof eveningFilterAtSchema>;
export type EveningFilter = z.infer<typeof eveningFilterSchema>;
export type FilteredPlace<T extends Place = Place> = T & {
  unknown: boolean;
};

export const defaultEveningFilter: EveningFilter = {
  at: 'now',
  types: [],
  maxCheck: null,
  nearMetro: false,
};

export function resolveFilterDate(at: EveningFilterAt, now: Date): Date {
  if (at === 'now') {
    return now;
  }

  const moscowNow = new Date(now.getTime() + MOSCOW_UTC_OFFSET_MS);
  const moscowTargetMs = Date.UTC(
    moscowNow.getUTCFullYear(),
    moscowNow.getUTCMonth(),
    moscowNow.getUTCDate(),
    at,
    0,
    0,
    0,
  );

  return new Date(moscowTargetMs - MOSCOW_UTC_OFFSET_MS);
}

export function applyEveningFilter<T extends Place>(
  places: readonly T[],
  filter: EveningFilter,
  now: Date,
): FilteredPlace<T>[] {
  const targetDate = resolveFilterDate(filter.at, now);
  const result: FilteredPlace<T>[] = [];

  for (const place of places) {
    if (filter.types.length > 0 && !filter.types.includes(place.type)) {
      continue;
    }

    if (filter.nearMetro && place.metro.distanceM > NEAR_METRO_MAX_DISTANCE_M) {
      continue;
    }

    const status = hoursStatus(place.hours, targetDate);
    if (status.kind === 'closed') {
      continue;
    }

    if (filter.maxCheck !== null && place.avgCheck !== null && place.avgCheck > filter.maxCheck) {
      continue;
    }

    const unknown = status.kind === 'unknown' || place.avgCheck === null;
    result.push({ ...place, unknown });
  }

  return result;
}
