import { describe, expect, it, vi } from 'vitest';

import { demoSeedPlacesFixture, enableMocks, readMockState, resetMockState } from '@/shared/api';

import {
  applyOptimisticVisit,
  clampVisitComment,
  ensurePlaceAndMarkVisit,
  evaluateVisitLocation,
  getDemoVisitLocation,
  isPrefersReducedMotion,
  isVisitDemoModeEnabled,
  MAX_NOTE_LENGTH,
  requestCurrentVisitLocation,
  updateLatestVisitInMockDb,
} from './mark-visit-model';

const sampleSavedPlace = demoSeedPlacesFixture[0];
if (!sampleSavedPlace) {
  throw new Error('Expected demoSeedPlacesFixture to have at least one item');
}
const samplePlace = sampleSavedPlace.place;

describe('mark-visit-model', () => {
  it('evaluates visit location within 200 m as verified and beyond 200 m as unverified', () => {
    const nearLocation = getDemoVisitLocation(samplePlace.location, 'near');
    const nearEval = evaluateVisitLocation(nearLocation, samplePlace.location);
    expect(nearEval.verified).toBe(true);
    expect(nearEval.distanceMeters).toBe(0);

    const farLocation = getDemoVisitLocation(samplePlace.location, 'far');
    const farEval = evaluateVisitLocation(farLocation, samplePlace.location);
    expect(farEval.verified).toBe(false);
    expect(farEval.distanceMeters).toBeGreaterThan(200);

    const nullEval = evaluateVisitLocation(null, samplePlace.location);
    expect(nullEval.verified).toBe(false);
    expect(nullEval.distanceMeters).toBeNull();
  });

  it('clamps visit comment to MAX_NOTE_LENGTH (280 chars)', () => {
    const longText = 'а'.repeat(320);
    expect(clampVisitComment(longText)).toHaveLength(MAX_NOTE_LENGTH);
  });

  it('respects demo mode and prefers-reduced-motion overrides', () => {
    expect(isVisitDemoModeEnabled(true)).toBe(true);
    expect(isVisitDemoModeEnabled(false)).toBe(false);
    expect(isPrefersReducedMotion(true)).toBe(true);
    expect(isPrefersReducedMotion(false)).toBe(false);
  });

  it('applies optimistic visit to existing or missing saved place', () => {
    const visit = {
      at: '2026-10-27T18:00:00.000Z',
      verified: true,
      expectation: 'as_expected' as const,
      comment: null,
    };

    const existingResult = applyOptimisticVisit(
      [sampleSavedPlace],
      samplePlace,
      sampleSavedPlace,
      visit,
    );
    expect(existingResult.updated.visits).toHaveLength(1);
    expect(existingResult.list).toHaveLength(1);

    const missingResult = applyOptimisticVisit([], samplePlace, null, visit);
    expect(missingResult.updated.place.id).toBe(samplePlace.id);
    expect(missingResult.updated.visits).toHaveLength(1);
    expect(missingResult.list).toHaveLength(1);
  });

  it('requests current browser geolocation or resolves null on error', async () => {
    const originalGeo = navigator.geolocation;

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: {
              latitude: 55.7568,
              longitude: 37.6062,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          });
        },
      },
    });

    await expect(requestCurrentVisitLocation()).resolves.toEqual({
      lat: 55.7568,
      lng: 37.6062,
    });

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
          error?.({
            code: 1,
            message: 'Permission denied',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        },
      },
    });

    await expect(requestCurrentVisitLocation()).resolves.toBeNull();

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeo,
    });
  });

  it('ensures place is saved before marking visit and updates mock DB visit fields', async () => {
    await enableMocks();
    resetMockState();

    const saved = await ensurePlaceAndMarkVisit({
      place: samplePlace,
      savedPlace: sampleSavedPlace,
      location: samplePlace.location,
      verified: true,
    });

    expect(saved.visits).toHaveLength(1);
    expect(saved.visits[0]?.verified).toBe(true);

    const patched = updateLatestVisitInMockDb(samplePlace.id, {
      verified: false,
      expectation: 'better',
      comment: 'Отличное место',
    });

    expect(patched?.visits[0]?.verified).toBe(false);
    expect(patched?.visits[0]?.expectation).toBe('better');
    expect(patched?.visits[0]?.comment).toBe('Отличное место');

    const db = readMockState();
    const stored = db.savedPlaces.find((item) => item.place.id === samplePlace.id);
    expect(stored?.visits[0]?.expectation).toBe('better');

    resetMockState();
    vi.restoreAllMocks();
  });
});
