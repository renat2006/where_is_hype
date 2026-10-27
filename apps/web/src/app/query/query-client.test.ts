import { beforeEach, describe, expect, it } from 'vitest';

import { savedPlaceQueries } from '@/entities/saved-place';
import {
  PERSISTED_PLACES_CACHE_KEY,
  readPersistedPlacesCache,
  writePersistedPlacesCache,
} from '@/features/offline-status';
import { demoSeedPlacesFixture } from '@/shared/api';

import { createAppQueryClient } from './query-client';

describe('app/query persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists saved places query cache to localStorage on query success', () => {
    const client = createAppQueryClient();
    const places = demoSeedPlacesFixture.slice(0, 3);
    const updatedAt = new Date('2026-10-27T18:40:00+03:00').getTime();

    client.setQueryData(savedPlaceQueries.list().queryKey, places, {
      updatedAt,
    });

    const persisted = readPersistedPlacesCache();
    expect(persisted).not.toBeNull();
    expect(persisted?.version).toBe(1);
    expect(persisted?.updatedAt).toBe(updatedAt);
    expect(persisted?.savedPlaces).toHaveLength(3);
    expect(persisted?.savedPlaces[0]?.place.name).toBe(places[0]?.place.name);
  });

  it('hydrates saved places query cache and dataUpdatedAt from localStorage on startup', () => {
    const places = demoSeedPlacesFixture.slice(0, 4);
    const updatedAt = new Date('2026-10-27T18:40:00+03:00').getTime();

    writePersistedPlacesCache(places, updatedAt);

    const client = createAppQueryClient();
    const listKey = savedPlaceQueries.list().queryKey;
    const data = client.getQueryData(listKey);
    const state = client.getQueryState(listKey);

    expect(data).toHaveLength(4);
    expect(state?.dataUpdatedAt).toBe(updatedAt);
  });

  it('ignores corrupted localStorage cache payloads without throwing', () => {
    window.localStorage.setItem(PERSISTED_PLACES_CACHE_KEY, '{invalid-json');

    const client = createAppQueryClient();
    const data = client.getQueryData(savedPlaceQueries.list().queryKey);

    expect(data).toBeUndefined();
    expect(readPersistedPlacesCache()).toBeNull();
  });
});
