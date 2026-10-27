import { describe, expect, it } from 'vitest';

import type { Place } from './place';
import { placeSchema, placeTypeSchema } from './place';

const validPlace: Place = {
  id: 'p1',
  name: 'Жук и Пчела',
  type: 'coffee',
  address: 'Мясницкая, 24',
  metro: { name: 'Чистые пруды', distanceM: 350 },
  location: { lat: 55.7649, lng: 37.6389 },
  hours: {
    mon: { open: '08:00', close: '22:00' },
    tue: { open: '08:00', close: '22:00' },
    wed: { open: '08:00', close: '22:00' },
    thu: { open: '08:00', close: '22:00' },
    fri: { open: '08:00', close: '23:00' },
    sat: { open: '09:00', close: '23:00' },
    sun: { open: '09:00', close: '22:00' },
  },
  avgCheck: 600,
  yandexOrgId: '1029384756',
};

describe('placeSchema', () => {
  it('accepts a valid place with full details', () => {
    expect(placeSchema.parse(validPlace)).toEqual(validPlace);
  });

  it('accepts a place with null hours, avgCheck and yandexOrgId', () => {
    const placeWithNulls: Place = {
      ...validPlace,
      hours: null,
      avgCheck: null,
      yandexOrgId: null,
    };

    expect(placeSchema.parse(placeWithNulls)).toEqual(placeWithNulls);
  });

  it('validates all four place types', () => {
    expect(placeTypeSchema.options).toEqual(['coffee', 'cafe', 'rest', 'bar']);
  });

  it('rejects coordinates outside the valid range', () => {
    const result = placeSchema.safeParse({
      ...validPlace,
      location: { lat: 120, lng: 37.6 },
    });

    expect(result.success).toBe(false);
  });

  it('rejects negative metro distance or avgCheck', () => {
    expect(
      placeSchema.safeParse({
        ...validPlace,
        metro: { name: 'Чистые пруды', distanceM: -10 },
      }).success,
    ).toBe(false);

    expect(
      placeSchema.safeParse({
        ...validPlace,
        avgCheck: 0,
      }).success,
    ).toBe(false);
  });
});
