import { describe, expect, it } from 'vitest';

import { placeSchema } from './place';

const validPlace = {
  id: 'p1',
  name: 'Кофейня на Покровке',
  address: 'Покровка, 1',
  location: { lat: 55.759, lng: 37.645 },
  noiseLevel: 'quiet',
  entrancePhotoUrl: null,
};

describe('placeSchema', () => {
  it('accepts a valid place', () => {
    expect(placeSchema.parse(validPlace)).toEqual(validPlace);
  });

  it('rejects coordinates outside the valid range', () => {
    const result = placeSchema.safeParse({ ...validPlace, location: { lat: 120, lng: 37.6 } });

    expect(result.success).toBe(false);
  });
});
