import type {
  Expectation,
  Location,
  SavedPlace,
  Visit,
  VisitExpectation,
} from '@where-is-hype/core';
import {
  distanceM,
  expectationSchema,
  getMoscowDayAndMinutes,
  MAX_NOTE_LENGTH,
  savedPlaceSchema,
  VISIT_VERIFICATION_RADIUS_M,
  visitExpectations,
  visitExpectationSchema,
  visitSchema,
} from '@where-is-hype/core';

export function isPlaceSaved(savedPlaces: readonly SavedPlace[], placeId: string): boolean {
  return savedPlaces.some((item) => item.place.id === placeId);
}

export function findSavedPlace(
  savedPlaces: readonly SavedPlace[],
  placeId: string,
): SavedPlace | undefined {
  return savedPlaces.find((item) => item.place.id === placeId);
}

export function isPlaceVisited(savedPlace: Pick<SavedPlace, 'visits'>): boolean {
  return savedPlace.visits.length > 0;
}

export function countVisitedPlaces(savedPlaces: readonly Pick<SavedPlace, 'visits'>[]): number {
  return savedPlaces.filter((item) => isPlaceVisited(item)).length;
}

function getMoscowDateStamp(at: Date): string {
  const moscowDate = new Date(at.getTime() + 3 * 60 * 60 * 1000);
  const year = String(moscowDate.getUTCFullYear());
  const month = String(moscowDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(moscowDate.getUTCDate()).padStart(2, '0');
  const { dayIndex } = getMoscowDayAndMinutes(at);
  return `${year}-${month}-${day}-${String(dayIndex)}`;
}

export function hasVisitedToday(
  savedPlace: Pick<SavedPlace, 'visits'>,
  now: Date = new Date(),
): boolean {
  const todayStamp = getMoscowDateStamp(now);
  return savedPlace.visits.some((visit) => {
    const visitDate = new Date(visit.at);
    return !Number.isNaN(visitDate.getTime()) && getMoscowDateStamp(visitDate) === todayStamp;
  });
}

export function isWithinVisitRadius(userLocation: Location, placeLocation: Location): boolean {
  return distanceM(userLocation, placeLocation) <= VISIT_VERIFICATION_RADIUS_M;
}

export {
  expectationSchema,
  MAX_NOTE_LENGTH,
  savedPlaceSchema,
  VISIT_VERIFICATION_RADIUS_M,
  visitExpectations,
  visitExpectationSchema,
  visitSchema,
};
export type { Expectation, SavedPlace, Visit, VisitExpectation };
