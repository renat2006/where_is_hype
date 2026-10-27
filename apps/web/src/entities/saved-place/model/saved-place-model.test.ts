import { describe, expect, it } from 'vitest';

import { demoSeedPlacesFixture } from '@/shared/api';

import {
  countVisitedPlaces,
  findSavedPlace,
  hasVisitedToday,
  isPlaceSaved,
  isPlaceVisited,
  isWithinVisitRadius,
} from './saved-place-model';

describe('saved-place-model', () => {
  it('checks saved state, visited count, daily visit limit, and 200m verification radius', () => {
    expect(isPlaceSaved(demoSeedPlacesFixture, 'sosny')).toBe(true);
    expect(isPlaceSaved(demoSeedPlacesFixture, 'unknown')).toBe(false);
    expect(findSavedPlace(demoSeedPlacesFixture, 'sosny')?.place.name).toBe('Сосны');

    expect(countVisitedPlaces(demoSeedPlacesFixture)).toBe(1);
    const zerno = findSavedPlace(demoSeedPlacesFixture, 'zerno');
    expect(zerno).toBeDefined();
    if (zerno) {
      expect(isPlaceVisited(zerno)).toBe(true);
      expect(hasVisitedToday(zerno, new Date('2026-10-19T18:00:00.000Z'))).toBe(true);
      expect(hasVisitedToday(zerno, new Date('2026-10-27T18:00:00.000Z'))).toBe(false);

      expect(isWithinVisitRadius(zerno.place.location, zerno.place.location)).toBe(true);
      expect(isWithinVisitRadius({ lat: 55.75, lng: 37.6 }, zerno.place.location)).toBe(false);
    }
  });
});
