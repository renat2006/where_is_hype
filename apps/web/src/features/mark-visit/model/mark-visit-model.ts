import type { Location, Place, SavedPlace, Visit, VisitExpectation } from '@where-is-hype/core';
import { distanceM, MAX_NOTE_LENGTH, VISIT_VERIFICATION_RADIUS_M } from '@where-is-hype/core';

import { isWithinVisitRadius, markPlaceVisit, savePlace } from '@/entities/saved-place';
import { ApiError, readMockState, writeMockState } from '@/shared/api';
import { env } from '@/shared/config';

export type DemoProximity = 'near' | 'far';

export const MARK_VISIT_BUTTON_LABEL = 'Я здесь';
export const VISIT_MARKED_TODAY_CAPTION = 'Не больше одного визита в место за день';
export const VISIT_SAVED_TOAST_MESSAGE = 'Записали. Спасибо!';
export const DEMO_PROXIMITY_TOGGLE_LABEL = 'Демо: я рядом / я далеко';

export const EXPECTATION_OPTIONS: readonly { value: VisitExpectation; label: string }[] = [
  { value: 'better', label: 'Лучше' },
  { value: 'as_expected', label: 'Как ждал' },
  { value: 'worse', label: 'Хуже' },
] as const;

export function isVisitDemoModeEnabled(override?: boolean): boolean {
  if (override !== undefined) {
    return override;
  }
  if (import.meta.env.VITE_API_MOCKS === 'true') {
    return true;
  }
  if (import.meta.env.VITE_API_MOCKS === 'false') {
    return false;
  }
  return env.apiMocks || Boolean(import.meta.env.VITEST) || import.meta.env.MODE === 'test';
}

export function isPrefersReducedMotion(override?: boolean): boolean {
  if (override !== undefined) {
    return override;
  }
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getDemoVisitLocation(
  placeLocation: Location,
  proximity: DemoProximity = 'near',
): Location {
  if (proximity === 'near') {
    return {
      lat: placeLocation.lat,
      lng: placeLocation.lng,
    };
  }

  return {
    lat: Number((placeLocation.lat + 0.005).toFixed(6)),
    lng: Number((placeLocation.lng + 0.005).toFixed(6)),
  };
}

export interface VisitLocationEvaluation {
  verified: boolean;
  distanceMeters: number | null;
  location: Location | null;
}

export function evaluateVisitLocation(
  userLocation: Location | null | undefined,
  placeLocation: Location,
): VisitLocationEvaluation {
  if (!userLocation) {
    return {
      verified: false,
      distanceMeters: null,
      location: null,
    };
  }

  const distanceMeters = distanceM(userLocation, placeLocation);
  const verified = isWithinVisitRadius(userLocation, placeLocation);

  return {
    verified,
    distanceMeters,
    location: userLocation,
  };
}

export function requestCurrentVisitLocation(timeoutMs = 5000): Promise<Location | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve(null);
  }

  const geo = navigator.geolocation as Geolocation | undefined;
  if (!geo || typeof geo.getCurrentPosition !== 'function') {
    return Promise.resolve(null);
  }

  return new Promise<Location | null>((resolve) => {
    geo.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 60_000,
      },
    );
  });
}

export function clampVisitComment(rawComment: string): string {
  return rawComment.slice(0, MAX_NOTE_LENGTH);
}

export function applyOptimisticVisit(
  savedPlaces: readonly SavedPlace[] | undefined,
  fallbackPlace: Place,
  fallbackSavedPlace: SavedPlace | null | undefined,
  visit: Visit,
): { list: SavedPlace[]; updated: SavedPlace } {
  const baseList = savedPlaces ? [...savedPlaces] : [];
  const index = baseList.findIndex((item) => item.place.id === fallbackPlace.id);
  const existing = index >= 0 ? baseList[index] : undefined;

  if (existing) {
    const updated: SavedPlace = {
      ...existing,
      visits: [...existing.visits, visit],
    };
    baseList[index] = updated;
    return { list: baseList, updated };
  }

  const created: SavedPlace = {
    place: fallbackPlace,
    sourceUrl: fallbackSavedPlace?.sourceUrl ?? null,
    sourcePlatform: fallbackSavedPlace?.sourcePlatform ?? 'other',
    note: fallbackSavedPlace?.note ?? '',
    addedAt: fallbackSavedPlace?.addedAt ?? visit.at,
    visits: [...(fallbackSavedPlace?.visits ?? []), visit],
  };

  return {
    list: [created, ...baseList],
    updated: created,
  };
}

export function updateLatestVisitInMockDb(
  placeId: string,
  patch: Partial<Pick<Visit, 'verified' | 'expectation' | 'comment'>>,
): SavedPlace | null {
  const db = readMockState();
  const index = db.savedPlaces.findIndex((item) => item.place.id === placeId);
  const current = index >= 0 ? db.savedPlaces[index] : undefined;
  if (!current || current.visits.length === 0) {
    return null;
  }

  const lastIndex = current.visits.length - 1;
  const updatedVisits = current.visits.map((visit, idx) =>
    idx === lastIndex
      ? {
          ...visit,
          ...(patch.verified !== undefined ? { verified: patch.verified } : {}),
          ...(patch.expectation !== undefined ? { expectation: patch.expectation } : {}),
          ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
        }
      : visit,
  );

  const updated: SavedPlace = {
    ...current,
    visits: updatedVisits,
  };

  db.savedPlaces[index] = updated;
  writeMockState(db);
  return updated;
}

export async function ensurePlaceAndMarkVisit(options: {
  place: Place;
  savedPlace?: SavedPlace | null | undefined;
  location: Location | null;
  verified: boolean;
}): Promise<SavedPlace> {
  const { place, savedPlace, location, verified } = options;

  try {
    return await markPlaceVisit({
      placeId: place.id,
      location,
      verified,
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
        location,
        verified,
      });
    }
    throw error;
  }
}

export { MAX_NOTE_LENGTH, VISIT_VERIFICATION_RADIUS_M };
