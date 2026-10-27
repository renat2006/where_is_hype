import type {
  Candidate,
  Location,
  Place,
  PlaceMetro,
  PlaceType,
  Platform,
  SourcePlatform,
} from '@where-is-hype/core';
import {
  candidateSchema,
  detectPlatform,
  distanceM,
  placeMetroSchema,
  placeSchema,
  placeTypeLabel,
  placeTypes,
  placeTypeSchema,
  platformLabel,
  platforms,
  platformSchema,
  sourcePlatformSchema,
} from '@where-is-hype/core';

import { GARDEN_RING_CENTER, GARDEN_RING_RADIUS_M, isInsideGardenRing } from '@/shared/api';

export const MIN_SEARCH_QUERY_LENGTH = 2;

export function normalizeSearchQuery(query: string): string {
  return query.trim();
}

export function canSearchPlaces(query: string): boolean {
  return normalizeSearchQuery(query).length >= MIN_SEARCH_QUERY_LENGTH;
}

export function sortPlacesByDistance<T extends { location: Location }>(
  places: readonly T[],
  origin: Location,
): T[] {
  return [...places].sort((a, b) => distanceM(a.location, origin) - distanceM(b.location, origin));
}

export {
  candidateSchema,
  detectPlatform,
  GARDEN_RING_CENTER,
  GARDEN_RING_RADIUS_M,
  isInsideGardenRing,
  placeMetroSchema,
  placeSchema,
  placeTypeLabel,
  placeTypes,
  placeTypeSchema,
  platformLabel,
  platforms,
  platformSchema,
  sourcePlatformSchema,
};
export type { Candidate, Place, PlaceMetro, PlaceType, Platform, SourcePlatform };
