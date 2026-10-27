import { describe, expect, it } from 'vitest';

import { demoSeedPlacesFixture } from '@/shared/api';

import { countSheetVisitedPlaces, sortSheetPlacesByDistance } from './places-sheet-model';

describe('places-sheet-model', () => {
  it('sorts places by ascending distance from origin and counts visited places', () => {
    const origin = { lat: 55.7649, lng: 37.6389 }; // Чистые пруды
    const sorted = sortSheetPlacesByDistance(demoSeedPlacesFixture, origin);

    expect(sorted.length).toBe(demoSeedPlacesFixture.length);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      expect(curr?.distanceM).toBeGreaterThanOrEqual(prev?.distanceM ?? 0);
    }

    expect(countSheetVisitedPlaces(demoSeedPlacesFixture)).toBe(1);
  });
});
