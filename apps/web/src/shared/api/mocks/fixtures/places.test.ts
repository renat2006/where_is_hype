import {
  applyEveningFilter,
  formatHoursStatus,
  placeSchema,
  placeTypes,
  savedPlaceSchema,
} from '@where-is-hype/core';
import { describe, expect, it } from 'vitest';

import {
  DEMO_RECOGNIZED_LINK,
  DEMO_SEED_PLACE_IDS,
  DEMO_UNKNOWN_LINK,
  demoLinks,
  demoSeedPlacesFixture,
  isInsideGardenRing,
  placesFixture,
} from '@/shared/api';

describe('placesFixture and demo fixtures', () => {
  it('contains 40 valid places inside the Garden Ring across all 4 types', () => {
    expect(placesFixture).toHaveLength(40);

    const ids = new Set<string>();
    for (const place of placesFixture) {
      expect(() => placeSchema.parse(place)).not.toThrow();
      expect(isInsideGardenRing(place.location)).toBe(true);
      ids.add(place.id);
    }
    expect(ids.size).toBe(40);

    for (const type of placeTypes) {
      const count = placesFixture.filter((place) => place.type === type).length;
      expect(count).toBe(10);
    }
  });

  it('has exactly 5 places without hours and 3 places without avgCheck', () => {
    const withoutHours = placesFixture.filter((place) => place.hours === null);
    const withoutCheck = placesFixture.filter((place) => place.avgCheck === null);

    expect(withoutHours).toHaveLength(5);
    expect(withoutCheck).toHaveLength(3);
  });

  it('exports the two demo links for expert scenario', () => {
    expect(DEMO_RECOGNIZED_LINK).toBe('https://www.instagram.com/reel/hype-coffee/');
    expect(DEMO_UNKNOWN_LINK).toBe('https://www.instagram.com/reel/unknown-place/');
    expect(demoLinks).toHaveLength(2);
  });

  it('seeds 8 demo places that yield 3-5 places under filter "Open at 19:00, check <= 1500"', () => {
    expect(DEMO_SEED_PLACE_IDS).toHaveLength(8);
    expect(demoSeedPlacesFixture).toHaveLength(8);

    for (const item of demoSeedPlacesFixture) {
      expect(() => savedPlaceSchema.parse(item)).not.toThrow();
    }

    const now = new Date('2026-10-27T15:00:00.000Z');
    const seedPlaces = demoSeedPlacesFixture.map((item) => item.place);

    const filteredSeedOnly = applyEveningFilter(
      seedPlaces,
      { at: 19, types: [], maxCheck: 1500, nearMetro: false },
      now,
    );

    expect(filteredSeedOnly.length).toBeGreaterThanOrEqual(3);
    expect(filteredSeedOnly.length).toBeLessThanOrEqual(5);
    expect(filteredSeedOnly).toHaveLength(4);

    const withUnknownHours = filteredSeedOnly.filter(
      (place) => formatHoursStatus(place.hours, now) === 'Часы не уточнены',
    );
    expect(withUnknownHours.length).toBeGreaterThanOrEqual(1);
    expect(withUnknownHours.some((place) => place.id === 'zhuravli')).toBe(true);

    // Also verify when the 1st candidate from DEMO_RECOGNIZED_LINK ('zhuk-i-pchela') is saved prior to seeding
    const recognizedPlace = placesFixture.find((place) => place.id === 'zhuk-i-pchela');
    expect(recognizedPlace).toBeDefined();
    if (recognizedPlace) {
      const filteredWithRecognized = applyEveningFilter(
        [recognizedPlace, ...seedPlaces],
        { at: 19, types: [], maxCheck: 1500, nearMetro: false },
        now,
      );
      expect(filteredWithRecognized.length).toBeGreaterThanOrEqual(3);
      expect(filteredWithRecognized.length).toBeLessThanOrEqual(5);
      expect(filteredWithRecognized).toHaveLength(5);
    }
  });
});
