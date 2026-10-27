import { describe, expect, it } from 'vitest';

import {
  canSearchPlaces,
  GARDEN_RING_CENTER,
  isInsideGardenRing,
  normalizeSearchQuery,
  sortPlacesByDistance,
} from './place-model';

describe('place-model', () => {
  it('validates search query length from 2nd character', () => {
    expect(normalizeSearchQuery('  Жу  ')).toBe('Жу');
    expect(canSearchPlaces('Ж')).toBe(false);
    expect(canSearchPlaces('  а ')).toBe(false);
    expect(canSearchPlaces('Жу')).toBe(true);
  });

  it('checks Garden Ring coordinates and sorts places by distance', () => {
    expect(isInsideGardenRing(GARDEN_RING_CENTER)).toBe(true);
    expect(isInsideGardenRing({ lat: 55.85, lng: 37.6173 })).toBe(false);

    const items = [
      { id: 'far', location: { lat: 55.77, lng: 37.65 } },
      { id: 'near', location: { lat: 55.756, lng: 37.618 } },
    ];

    const sorted = sortPlacesByDistance(items, GARDEN_RING_CENTER);
    expect(sorted.map((item) => item.id)).toEqual(['near', 'far']);
  });
});
