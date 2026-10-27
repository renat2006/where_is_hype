import { describe, expect, it } from 'vitest';

import type { Place } from '../place';
import type { Shortlist, Vote } from './shortlist';
import {
  createShortlistExpiresAt,
  shortlistSchema,
  tally,
  upsertVote,
  voteSchema,
} from './shortlist';

const makePlace = (id: string): Place => ({
  id,
  name: `Место ${id}`,
  type: 'bar',
  address: 'Покровка, 1',
  metro: { name: 'Чистые пруды', distanceM: 400 },
  location: { lat: 55.76, lng: 37.64 },
  hours: null,
  avgCheck: 1500,
  yandexOrgId: null,
});

describe('shortlistSchema and voteSchema', () => {
  it('accepts valid shortlist with up to 5 places and 7-day expiration', () => {
    const createdAt = '2026-10-27T12:00:00.000Z';
    const expiresAt = createShortlistExpiresAt(createdAt);

    expect(expiresAt).toBe('2026-11-03T12:00:00.000Z');

    const shortlist: Shortlist = {
      token: 'tok-123',
      places: [makePlace('p1'), makePlace('p2')],
      createdAt,
      expiresAt,
      votes: [
        { voterId: 'v1', name: 'Аня', placeIds: ['p1', 'p2'] },
        { voterId: 'v2', placeIds: ['p1'] },
      ],
    };

    expect(shortlistSchema.parse(shortlist)).toEqual(shortlist);
    expect(voteSchema.parse({ voterId: 'v2', placeIds: ['p1'] })).toEqual({
      voterId: 'v2',
      placeIds: ['p1'],
    });
  });

  it('rejects shortlist with more than 5 places', () => {
    const places = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(makePlace);
    const result = shortlistSchema.safeParse({
      token: 'tok-123',
      places,
      createdAt: '2026-10-27T12:00:00.000Z',
      expiresAt: '2026-11-03T12:00:00.000Z',
      votes: [],
    });

    expect(result.success).toBe(false);
  });
});

describe('tally and upsertVote', () => {
  it('counts votes per placeId', () => {
    const votes: Vote[] = [
      { voterId: 'v1', name: 'Аня', placeIds: ['p1', 'p2'] },
      { voterId: 'v2', name: 'Макс', placeIds: ['p1'] },
    ];

    expect(tally(votes)).toEqual({ p1: 2, p2: 1 });
  });

  it('replaces earlier vote when the same voter votes again', () => {
    const votes: Vote[] = [
      { voterId: 'v1', name: 'Аня', placeIds: ['p1', 'p1'] },
      { voterId: 'v1', name: 'Аня', placeIds: ['p2'] },
    ];

    expect(tally(votes)).toEqual({ p2: 1 });

    const upserted = upsertVote([{ voterId: 'v1', name: 'Аня', placeIds: ['p1'] }], {
      voterId: 'v1',
      name: 'Аня',
      placeIds: ['p2'],
    });

    expect(upserted).toEqual([{ voterId: 'v1', name: 'Аня', placeIds: ['p2'] }]);
  });
});
