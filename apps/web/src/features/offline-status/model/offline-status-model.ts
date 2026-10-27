import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMoscowDayAndMinutes,
  type Place,
  type SavedPlace,
  savedPlaceSchema,
} from '@where-is-hype/core';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';

import { savedPlaceQueries } from '@/entities/saved-place';

export const PERSISTED_PLACES_CACHE_KEY = 'where-is-hype:query-cache:v1';
export const SLOW_NETWORK_THRESHOLD_MS = 5_000;
export const OFFLINE_ACTION_SUFFIX = 'нужна сеть';
export const OFFLINE_EXPLANATION_TEXT =
  'Карта, добавление места и отправка друзьям вернутся, когда появится сеть. Расстояния — по последней точке.';

const TIME_HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const persistedPlacesCacheSchema = z.object({
  version: z.literal(1),
  updatedAt: z.number().int().nonnegative(),
  savedPlaces: z.array(savedPlaceSchema),
});

export type PersistedPlacesCache = z.infer<typeof persistedPlacesCacheSchema>;

const savedPlaceArraySchema = z.array(savedPlaceSchema);

function getDefaultStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPersistedPlacesCache(
  storage: Storage | null = getDefaultStorage(),
): PersistedPlacesCache | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(PERSISTED_PLACES_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    const validated = persistedPlacesCacheSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

export function writePersistedPlacesCache(
  savedPlaces: unknown,
  updatedAt: number = Date.now(),
  storage: Storage | null = getDefaultStorage(),
): PersistedPlacesCache | null {
  const validatedPlaces = savedPlaceArraySchema.safeParse(savedPlaces);
  if (!validatedPlaces.success) {
    return null;
  }

  const normalizedUpdatedAt =
    Number.isFinite(updatedAt) && updatedAt >= 0 ? Math.floor(updatedAt) : Date.now();

  const payload: PersistedPlacesCache = {
    version: 1,
    updatedAt: normalizedUpdatedAt,
    savedPlaces: validatedPlaces.data,
  };

  if (storage) {
    try {
      storage.setItem(PERSISTED_PLACES_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota or storage restriction errors
    }
  }

  return payload;
}

export function clearPersistedPlacesCache(storage: Storage | null = getDefaultStorage()): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(PERSISTED_PLACES_CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function isSavedPlacesListQueryKey(queryKey: unknown): boolean {
  if (!Array.isArray(queryKey)) {
    return false;
  }
  const targetKey = savedPlaceQueries.list().queryKey;
  return (
    queryKey.length === targetKey.length &&
    queryKey[0] === targetKey[0] &&
    queryKey[1] === targetKey[1]
  );
}

export function hydrateSavedPlacesQueryClient(
  queryClient: QueryClient,
  storage: Storage | null = getDefaultStorage(),
): PersistedPlacesCache | null {
  const cached = readPersistedPlacesCache(storage);
  if (!cached) {
    return null;
  }

  const listKey = savedPlaceQueries.list().queryKey;
  const existingState = queryClient.getQueryState(listKey);
  const existingUpdatedAt = existingState?.dataUpdatedAt ?? 0;

  if (!existingState?.data || existingUpdatedAt < cached.updatedAt) {
    queryClient.setQueryData(listKey, cached.savedPlaces, {
      updatedAt: cached.updatedAt,
    });
  }

  return cached;
}

export function setupQueryClientPersistence(
  queryClient: QueryClient,
  storage: Storage | null = getDefaultStorage(),
): () => void {
  hydrateSavedPlacesQueryClient(queryClient, storage);

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    const query = event.query;
    if (!isSavedPlacesListQueryKey(query.queryKey)) {
      return;
    }

    if (query.state.status === 'success' && Array.isArray(query.state.data)) {
      const updatedAt = query.state.dataUpdatedAt > 0 ? query.state.dataUpdatedAt : Date.now();
      writePersistedPlacesCache(query.state.data, updatedAt, storage);
    }
  });

  return unsubscribe;
}

export function formatTimeHhMm(value: Date | number | string): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (TIME_HH_MM_PATTERN.test(trimmed)) {
      return trimmed;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const { minutes } = getMoscowDayAndMinutes(date);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function formatOfflineUpdatedAt(
  updatedAt: Date | number | string | null | undefined,
  fallbackNow?: Date,
): string {
  if (updatedAt !== null && updatedAt !== undefined && updatedAt !== 0 && updatedAt !== '') {
    const formatted = formatTimeHhMm(updatedAt);
    if (formatted) {
      return `обновлено в ${formatted}`;
    }
  }

  if (fallbackNow) {
    const fallbackFormatted = formatTimeHhMm(fallbackNow);
    if (fallbackFormatted) {
      return `обновлено в ${fallbackFormatted}`;
    }
  }

  return 'обновлено недавно';
}

export function formatOfflineActionLabel(
  label: string,
  suffix: string = OFFLINE_ACTION_SUFFIX,
): string {
  const trimmedLabel = label.trim();
  const trimmedSuffix = suffix.trim();
  if (!trimmedLabel) {
    return trimmedSuffix;
  }
  if (trimmedLabel.toLowerCase().endsWith(trimmedSuffix.toLowerCase())) {
    return trimmedLabel;
  }
  return `${trimmedLabel} · ${trimmedSuffix}`;
}

let offlineOverrideState: boolean | null = null;
const networkListeners = new Set<() => void>();

function emitNetworkChange(): void {
  for (const listener of networkListeners) {
    listener();
  }
}

export function setOfflineStatusOverride(isOffline: boolean | null): void {
  offlineOverrideState = isOffline;
  emitNetworkChange();
}

export function getOfflineSnapshot(): boolean {
  if (offlineOverrideState !== null) {
    return offlineOverrideState;
  }
  if (typeof navigator === 'undefined') {
    return false;
  }
  return !navigator.onLine;
}

function getServerOfflineSnapshot(): boolean {
  return false;
}

function subscribeOfflineStatus(onStoreChange: () => void): () => void {
  networkListeners.add(onStoreChange);

  if (typeof window === 'undefined') {
    return () => {
      networkListeners.delete(onStoreChange);
    };
  }

  const handleOnline = () => {
    onStoreChange();
  };
  const handleOffline = () => {
    onStoreChange();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    networkListeners.delete(onStoreChange);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

export interface OfflineStatusState {
  isOffline: boolean;
  isOnline: boolean;
}

export function useOfflineStatus(overrideOffline?: boolean): OfflineStatusState {
  const storeOffline = useSyncExternalStore(
    subscribeOfflineStatus,
    getOfflineSnapshot,
    getServerOfflineSnapshot,
  );
  const isOffline = overrideOffline ?? storeOffline;
  return {
    isOffline,
    isOnline: !isOffline,
  };
}

export function useSlowLoading(
  isLoading: boolean,
  thresholdMs: number = SLOW_NETWORK_THRESHOLD_MS,
): boolean {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!isLoading || thresholdMs <= 0) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setIsSlow(true);
    }, thresholdMs);

    return () => {
      window.clearTimeout(timerId);
      setIsSlow(false);
    };
  }, [isLoading, thresholdMs]);

  return isLoading && (thresholdMs <= 0 || isSlow);
}

export interface UseCachedSavedPlacesOptions {
  places?: readonly (Place | SavedPlace)[] | undefined;
  updatedAt?: Date | number | string | null | undefined;
  offline?: boolean | undefined;
  now?: Date | undefined;
  slowThresholdMs?: number | undefined;
}

export interface UseCachedSavedPlacesResult {
  places: readonly (Place | SavedPlace)[];
  updatedAt: Date | number | string | null;
  updatedAtLabel: string;
  isOffline: boolean;
  isLoading: boolean;
  isSlowLoading: boolean;
}

export function useCachedSavedPlaces(
  options: UseCachedSavedPlacesOptions = {},
): UseCachedSavedPlacesResult {
  const { places: placesProp, updatedAt: updatedAtProp, offline, now, slowThresholdMs } = options;
  const queryClient = useQueryClient();
  const { isOffline } = useOfflineStatus(offline);

  const persisted = readPersistedPlacesCache();

  useEffect(() => {
    if (isOffline && persisted) {
      hydrateSavedPlacesQueryClient(queryClient);
    }
  }, [isOffline, persisted, queryClient]);

  const query = useQuery({
    ...savedPlaceQueries.list(),
    enabled: placesProp === undefined && !isOffline,
    retry: isOffline ? false : 1,
  });

  useEffect(() => {
    if (query.data && query.dataUpdatedAt > 0) {
      writePersistedPlacesCache(query.data, query.dataUpdatedAt);
    }
  }, [query.data, query.dataUpdatedAt]);

  const resolvedPlaces = placesProp ?? query.data ?? persisted?.savedPlaces ?? [];
  const resolvedUpdatedAt =
    updatedAtProp ??
    (query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null) ??
    persisted?.updatedAt ??
    null;

  const isLoading =
    placesProp === undefined && !isOffline && query.isLoading && resolvedPlaces.length === 0;
  const isSlowLoading = useSlowLoading(isLoading, slowThresholdMs);

  return {
    places: resolvedPlaces,
    updatedAt: resolvedUpdatedAt,
    updatedAtLabel: formatOfflineUpdatedAt(resolvedUpdatedAt, now),
    isOffline,
    isLoading,
    isSlowLoading,
  };
}
