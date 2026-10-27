import type { Location, Place, SavedPlace } from '@where-is-hype/core';
import { distanceM } from '@where-is-hype/core';

import { countVisitedPlaces } from '@/entities/saved-place';

export interface SheetPlaceEntry<T extends Place | SavedPlace = Place | SavedPlace> {
  item: T;
  place: Place;
  distanceM: number;
  visited: boolean;
}

export function extractSheetPlace(item: Place | SavedPlace): Place {
  return 'place' in item ? item.place : item;
}

export function isSheetItemVisited(item: Place | SavedPlace): boolean {
  return 'visits' in item && item.visits.length > 0;
}

export function sortSheetPlacesByDistance<T extends Place | SavedPlace>(
  items: readonly T[],
  origin?: Location | null,
): SheetPlaceEntry<T>[] {
  const entries = items.map((item) => {
    const place = extractSheetPlace(item);
    const dist = origin ? distanceM(place.location, origin) : place.metro.distanceM;
    return {
      item,
      place,
      distanceM: dist,
      visited: isSheetItemVisited(item),
    };
  });

  return entries.sort((a, b) => {
    if (a.distanceM !== b.distanceM) {
      return a.distanceM - b.distanceM;
    }
    return a.place.name.localeCompare(b.place.name, 'ru');
  });
}

export function countSheetVisitedPlaces(items: readonly (Place | SavedPlace)[]): number {
  const savedItems = items.filter((item): item is SavedPlace => 'visits' in item);
  return countVisitedPlaces(savedItems);
}
