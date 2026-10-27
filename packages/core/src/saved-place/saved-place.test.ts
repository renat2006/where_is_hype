import { describe, expect, it } from 'vitest';

import type { SavedPlace, Visit } from './saved-place';
import { MAX_NOTE_LENGTH, savedPlaceSchema, visitSchema } from './saved-place';

const validVisit: Visit = {
  at: '2026-10-27T19:30:00+03:00',
  verified: true,
  expectation: 'better',
  comment: 'Отличный фильтр-кофе',
};

const validSavedPlace: SavedPlace = {
  place: {
    id: 'zhuk',
    name: 'Жук и Пчела',
    type: 'coffee',
    address: 'Мясницкая, 24',
    metro: { name: 'Чистые пруды', distanceM: 350 },
    location: { lat: 55.7649, lng: 37.6389 },
    hours: null,
    avgCheck: 600,
    yandexOrgId: null,
  },
  sourceUrl: 'https://vt.tiktok.com/ZS8kQ2pLm',
  sourcePlatform: 'tiktok',
  note: 'раф с халвой',
  addedAt: '2026-10-26T12:00:00+03:00',
  visits: [validVisit],
};

describe('visitSchema', () => {
  it('accepts a valid visit with expectation and comment', () => {
    expect(visitSchema.parse(validVisit)).toEqual(validVisit);
  });

  it('accepts a visit with null expectation and null comment', () => {
    const unanswered: Visit = {
      at: '2026-10-27T19:30:00+03:00',
      verified: false,
      expectation: null,
      comment: null,
    };

    expect(visitSchema.parse(unanswered)).toEqual(unanswered);
  });
});

describe('savedPlaceSchema', () => {
  it('accepts a valid saved place', () => {
    expect(savedPlaceSchema.parse(validSavedPlace)).toEqual(validSavedPlace);
  });

  it('accepts a note with exactly 280 characters and rejects 281 characters', () => {
    const maxNote = 'а'.repeat(MAX_NOTE_LENGTH);
    expect(savedPlaceSchema.safeParse({ ...validSavedPlace, note: maxNote }).success).toBe(true);

    const tooLongNote = 'а'.repeat(MAX_NOTE_LENGTH + 1);
    expect(savedPlaceSchema.safeParse({ ...validSavedPlace, note: tooLongNote }).success).toBe(
      false,
    );
  });

  it('accepts null sourceUrl when saved by name without link', () => {
    const byName: SavedPlace = {
      ...validSavedPlace,
      sourceUrl: null,
      sourcePlatform: 'other',
    };

    expect(savedPlaceSchema.parse(byName)).toEqual(byName);
  });
});
