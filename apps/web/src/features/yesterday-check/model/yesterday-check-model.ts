import type { Place, SavedPlace, Shortlist } from '@where-is-hype/core';

import { markPlaceVisit, savePlace } from '@/entities/saved-place';
import { ApiError, demoSeedPlacesFixture, placesFixture, readMockState } from '@/shared/api';

export const YESTERDAY_CHECK_DISMISSED_KEY = 'where-is-hype:yesterday-check-dismissed';

const MOSCOW_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toMoscowDayIndex(date: Date): number {
  return Math.floor((date.getTime() + MOSCOW_UTC_OFFSET_MS) / DAY_MS);
}

export function getShortlistCheckKey(shortlist: Pick<Shortlist, 'token' | 'createdAt'>): string {
  return `${shortlist.token}:${shortlist.createdAt}`;
}

export function isYesterdayCheckDismissed(shortlistKey: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const raw = window.localStorage.getItem(YESTERDAY_CHECK_DISMISSED_KEY);
    if (!raw) {
      return false;
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.includes(shortlistKey);
  } catch {
    return false;
  }
}

export function dismissYesterdayCheck(shortlistKey: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const raw = window.localStorage.getItem(YESTERDAY_CHECK_DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
    if (!list.includes(shortlistKey)) {
      list.push(shortlistKey);
    }
    window.localStorage.setItem(YESTERDAY_CHECK_DISMISSED_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage errors
  }
}

export function clearYesterdayCheckDismissals(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(YESTERDAY_CHECK_DISMISSED_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function isShortlistFromPreviousDay(
  shortlist: Pick<Shortlist, 'places' | 'createdAt' | 'expiresAt'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!shortlist || shortlist.places.length === 0) {
    return false;
  }

  const createdDate = new Date(shortlist.createdAt);
  const expiresDate = new Date(shortlist.expiresAt);
  if (Number.isNaN(createdDate.getTime()) || Number.isNaN(expiresDate.getTime())) {
    return false;
  }

  if (now.getTime() > expiresDate.getTime()) {
    return false;
  }

  const createdDay = toMoscowDayIndex(createdDate);
  const nowDay = toMoscowDayIndex(now);

  return nowDay > createdDay;
}

export function shouldShowYesterdayCheck(options: {
  shortlist: Shortlist | null | undefined;
  savedPlaces?: readonly SavedPlace[] | undefined;
  now?: Date | undefined;
}): boolean {
  const { shortlist, savedPlaces, now = new Date() } = options;

  if (!shortlist || !isShortlistFromPreviousDay(shortlist, now)) {
    return false;
  }

  const key = getShortlistCheckKey(shortlist);
  if (isYesterdayCheckDismissed(key)) {
    return false;
  }

  if (savedPlaces && savedPlaces.length > 0) {
    const createdTime = new Date(shortlist.createdAt).getTime();
    const allVisitedSinceShortlist = shortlist.places.every((placeEntry) => {
      const placeId = typeof placeEntry === 'string' ? placeEntry : placeEntry.id;
      const saved = savedPlaces.find((item) => item.place.id === placeId);
      if (!saved) {
        return false;
      }
      return saved.visits.some((visit) => new Date(visit.at).getTime() >= createdTime);
    });
    if (allVisitedSinceShortlist) {
      return false;
    }
  }

  return true;
}

export interface ShortlistPlaceEntry {
  place: Place;
  savedPlace: SavedPlace | null;
}

export function resolveShortlistPlaces(
  placesOrIds: readonly (Place | string)[],
  savedPlaces?: readonly SavedPlace[],
): ShortlistPlaceEntry[] {
  const dbSavedPlaces = readMockState().savedPlaces;
  const entries: ShortlistPlaceEntry[] = [];

  for (const item of placesOrIds) {
    const placeId = typeof item === 'string' ? item : item.id;
    const fromQuery = savedPlaces?.find((saved) => saved.place.id === placeId);
    const fromDb = dbSavedPlaces.find((saved) => saved.place.id === placeId);
    const fromDemoSeed = demoSeedPlacesFixture.find((saved) => saved.place.id === placeId);
    const savedPlace = fromQuery ?? fromDb ?? fromDemoSeed ?? null;

    if (savedPlace) {
      entries.push({
        place: savedPlace.place,
        savedPlace,
      });
      continue;
    }

    if (typeof item !== 'string') {
      entries.push({
        place: item,
        savedPlace: null,
      });
      continue;
    }

    const fromCatalog = placesFixture.find((catalogItem) => catalogItem.id === placeId);
    if (fromCatalog) {
      entries.push({
        place: fromCatalog,
        savedPlace: null,
      });
    }
  }

  return entries;
}

export async function markShortlistPlaceVisit(options: {
  place: Place;
  savedPlace?: SavedPlace | null | undefined;
}): Promise<SavedPlace> {
  const { place, savedPlace } = options;

  try {
    return await markPlaceVisit({
      placeId: place.id,
      location: null,
      verified: false,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await savePlace({
        placeId: place.id,
        sourceUrl: savedPlace?.sourceUrl ?? null,
        sourcePlatform: savedPlace?.sourcePlatform,
        note: savedPlace?.note,
      });
      return markPlaceVisit({
        placeId: place.id,
        location: null,
        verified: false,
      });
    }
    throw error;
  }
}
