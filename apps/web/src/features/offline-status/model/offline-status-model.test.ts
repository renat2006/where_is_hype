import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { savedPlaceQueries } from '@/entities/saved-place';
import { demoSeedPlacesFixture } from '@/shared/api';

import {
  clearPersistedPlacesCache,
  formatOfflineActionLabel,
  formatOfflineUpdatedAt,
  formatTimeHhMm,
  getOfflineSnapshot,
  hydrateSavedPlacesQueryClient,
  PERSISTED_PLACES_CACHE_KEY,
  readPersistedPlacesCache,
  setOfflineStatusOverride,
  setupQueryClientPersistence,
  writePersistedPlacesCache,
} from './offline-status-model';

describe('offline-status-model', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setOfflineStatusOverride(null);
  });

  afterEach(() => {
    window.localStorage.clear();
    setOfflineStatusOverride(null);
  });

  it('formats updatedAt timestamp in Moscow time as «обновлено в HH:MM»', () => {
    const date = new Date('2026-10-27T18:40:00+03:00');
    expect(formatTimeHhMm(date)).toBe('18:40');
    expect(formatOfflineUpdatedAt(date)).toBe('обновлено в 18:40');
    expect(formatOfflineUpdatedAt(date.getTime())).toBe('обновлено в 18:40');
    expect(formatOfflineUpdatedAt('18:40')).toBe('обновлено в 18:40');
    expect(formatOfflineUpdatedAt(null, new Date('2026-10-27T09:05:00+03:00'))).toBe(
      'обновлено в 09:05',
    );
    expect(formatOfflineUpdatedAt(null)).toBe('обновлено недавно');
  });

  it('formats offline action labels with «· нужна сеть» suffix without duplicating', () => {
    expect(formatOfflineActionLabel('Добавить место')).toBe('Добавить место · нужна сеть');
    expect(formatOfflineActionLabel('Отправить')).toBe('Отправить · нужна сеть');
    expect(formatOfflineActionLabel('Добавить место · нужна сеть')).toBe(
      'Добавить место · нужна сеть',
    );
  });

  it('reads, writes, validates with Zod, and clears persisted places cache', () => {
    const sample = demoSeedPlacesFixture.slice(0, 2);
    const updatedAt = new Date('2026-10-27T18:40:00+03:00').getTime();

    const written = writePersistedPlacesCache(sample, updatedAt);
    expect(written).not.toBeNull();

    const loaded = readPersistedPlacesCache();
    expect(loaded).toEqual({
      version: 1,
      updatedAt,
      savedPlaces: sample,
    });

    window.localStorage.setItem(
      PERSISTED_PLACES_CACHE_KEY,
      JSON.stringify({ version: 1, updatedAt: -5, savedPlaces: 'bad' }),
    );
    expect(readPersistedPlacesCache()).toBeNull();

    clearPersistedPlacesCache();
    expect(readPersistedPlacesCache()).toBeNull();
  });

  it('hydrates and subscribes QueryClient to persist saved places automatically', () => {
    const sample = demoSeedPlacesFixture.slice(0, 2);
    const updatedAt = new Date('2026-10-27T18:40:00+03:00').getTime();
    writePersistedPlacesCache(sample, updatedAt);

    const client = new QueryClient();
    const unsubscribe = setupQueryClientPersistence(client);

    expect(client.getQueryData(savedPlaceQueries.list().queryKey)).toHaveLength(2);
    expect(client.getQueryState(savedPlaceQueries.list().queryKey)?.dataUpdatedAt).toBe(updatedAt);

    const nextPlaces = demoSeedPlacesFixture.slice(0, 4);
    const nextUpdatedAt = new Date('2026-10-27T19:15:00+03:00').getTime();
    client.setQueryData(savedPlaceQueries.list().queryKey, nextPlaces, {
      updatedAt: nextUpdatedAt,
    });

    const persistedAfterUpdate = readPersistedPlacesCache();
    expect(persistedAfterUpdate?.savedPlaces).toHaveLength(4);
    expect(persistedAfterUpdate?.updatedAt).toBe(nextUpdatedAt);

    unsubscribe();

    const secondClient = new QueryClient();
    hydrateSavedPlacesQueryClient(secondClient);
    expect(secondClient.getQueryData(savedPlaceQueries.list().queryKey)).toHaveLength(4);
  });

  it('tracks offline override state accurately', () => {
    expect(getOfflineSnapshot()).toBe(false);
    setOfflineStatusOverride(true);
    expect(getOfflineSnapshot()).toBe(true);
    setOfflineStatusOverride(false);
    expect(getOfflineSnapshot()).toBe(false);
  });
});
