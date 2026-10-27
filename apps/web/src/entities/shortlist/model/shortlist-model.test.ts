import { afterEach, describe, expect, it } from 'vitest';

import { placesFixture, resetMockState } from '@/shared/api';

import {
  canAddToShortlist,
  canShareShortlist,
  getShortlistLeader,
  getVoterId,
  isInShortlist,
  toggleShortlistPlaceIds,
} from './shortlist-model';

describe('shortlist-model', () => {
  afterEach(() => {
    resetMockState();
  });

  it('validates shortlist limits, sharing rules, toggling, and leader calculation', () => {
    const p1 = placesFixture[0];
    const p2 = placesFixture[1];
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    if (!p1 || !p2) {
      return;
    }

    expect(canAddToShortlist({ places: [p1] })).toBe(true);
    expect(canShareShortlist({ places: [p1] })).toBe(false);
    expect(canShareShortlist({ places: [p1, p2] })).toBe(true);
    expect(isInShortlist({ places: [p1, p2] }, p1.id)).toBe(true);

    expect(toggleShortlistPlaceIds(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleShortlistPlaceIds(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleShortlistPlaceIds(['1', '2', '3', '4', '5'], '6')).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);

    const leader = getShortlistLeader({
      places: [p1, p2],
      votes: [
        { voterId: 'v1', placeIds: [p2.id] },
        { voterId: 'v2', placeIds: [p1.id, p2.id] },
      ],
    });
    expect(leader).toEqual({ place: p2, votes: 2 });

    const voterA = getVoterId();
    const voterB = getVoterId();
    expect(voterA).toBe(voterB);
  });
});
