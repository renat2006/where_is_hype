import type { Location, MetroStation } from '@where-is-hype/core';
import { locationSchema, metroStations } from '@where-is-hype/core';
import { useEffect, useSyncExternalStore } from 'react';
import { z } from 'zod';

import { GARDEN_RING_CENTER } from '@/entities/place';

export const GEO_ORIGIN_STORAGE_KEY = 'where-is-hype:geo-origin';
export const DEFAULT_METRO_STATION_ID = 'chistye-prudy';

export const POPULAR_METRO_STATION_IDS = [
  'chistye-prudy',
  'kitay-gorod',
  'tverskaya',
  'arbatskaya',
  'novokuznetskaya',
] as const;

export const geoOriginModeSchema = z.enum(['geolocation', 'metro']);
export const geoPermissionStatusSchema = z.enum(['prompt', 'granted', 'denied']);

export const geoOriginStateSchema = z.object({
  mode: geoOriginModeSchema.default('geolocation'),
  permissionStatus: geoPermissionStatusSchema.default('prompt'),
  requestedOnce: z.boolean().default(false),
  userLocation: locationSchema.nullable().default(null),
  metroStationId: z.string().min(1).nullable().default(null),
});

export type GeoOriginMode = z.infer<typeof geoOriginModeSchema>;
export type GeoPermissionStatus = z.infer<typeof geoPermissionStatusSchema>;
export type GeoOriginState = z.infer<typeof geoOriginStateSchema>;

const METRO_GENITIVE_NAMES: Readonly<Record<string, string>> = {
  'Чистые пруды': 'Чистых прудов',
  'Китай-город': 'Китай-города',
  Тверская: 'Тверской',
  Арбатская: 'Арбатской',
  Новокузнецкая: 'Новокузнецкой',
  'Охотный Ряд': 'Охотного Ряда',
  Пушкинская: 'Пушкинской',
  Чеховская: 'Чеховской',
  'Кузнецкий Мост': 'Кузнецкого Моста',
  Лубянка: 'Лубянки',
  Театральная: 'Театральной',
  'Площадь Революции': 'Площади Революции',
  'Библиотека имени Ленина': 'Библиотеки имени Ленина',
  'Александровский сад': 'Александровского сада',
  Боровицкая: 'Боровицкой',
  Кропоткинская: 'Кропоткинской',
  Третьяковская: 'Третьяковской',
  Полянка: 'Полянки',
  Трубная: 'Трубной',
  'Цветной бульвар': 'Цветного бульвара',
  Тургеневская: 'Тургеневской',
  'Сретенский бульвар': 'Сретенского бульвара',
  Маяковская: 'Маяковской',
  Сухаревская: 'Сухаревской',
  'Красные Ворота': 'Красных Ворот',
  Курская: 'Курской',
  Чкаловская: 'Чкаловской',
  Таганская: 'Таганской',
  Марксистская: 'Марксистской',
  Павелецкая: 'Павелецкой',
  Добрынинская: 'Добрынинской',
  Серпуховская: 'Серпуховской',
  Октябрьская: 'Октябрьской',
  'Парк культуры': 'Парка культуры',
  Смоленская: 'Смоленской',
  Баррикадная: 'Баррикадной',
};

export function createDefaultGeoOriginState(): GeoOriginState {
  return {
    mode: 'geolocation',
    permissionStatus: 'prompt',
    requestedOnce: false,
    userLocation: null,
    metroStationId: null,
  };
}

let cachedRawState: string | null = null;
let cachedParsedState: GeoOriginState = createDefaultGeoOriginState();
let isGeolocationRequestInFlight = false;
const listeners = new Set<() => void>();

function emitGeoOriginChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function getIsGeolocationRequestInFlight(): boolean {
  return isGeolocationRequestInFlight;
}

function setGeolocationRequestInFlight(value: boolean): void {
  if (isGeolocationRequestInFlight !== value) {
    isGeolocationRequestInFlight = value;
    emitGeoOriginChange();
  }
}

export function getStoredGeoOriginState(): GeoOriginState {
  if (typeof window === 'undefined') {
    return cachedParsedState;
  }

  try {
    const raw = window.localStorage.getItem(GEO_ORIGIN_STORAGE_KEY);
    if (raw === cachedRawState) {
      return cachedParsedState;
    }

    cachedRawState = raw;
    if (!raw) {
      cachedParsedState = createDefaultGeoOriginState();
      return cachedParsedState;
    }

    const parsed = geoOriginStateSchema.safeParse(JSON.parse(raw));
    cachedParsedState = parsed.success ? parsed.data : createDefaultGeoOriginState();
    return cachedParsedState;
  } catch {
    cachedParsedState = createDefaultGeoOriginState();
    return cachedParsedState;
  }
}

export function setStoredGeoOriginState(next: GeoOriginState): GeoOriginState {
  const validated = geoOriginStateSchema.parse(next);
  const serialized = JSON.stringify(validated);
  cachedRawState = serialized;
  cachedParsedState = validated;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(GEO_ORIGIN_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage errors in restricted environments
    }
  }

  emitGeoOriginChange();
  return validated;
}

export function resetGeoOriginState(): void {
  cachedRawState = null;
  cachedParsedState = createDefaultGeoOriginState();
  isGeolocationRequestInFlight = false;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(GEO_ORIGIN_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  emitGeoOriginChange();
}

export function findMetroStationById(
  stationId: string | null | undefined,
): MetroStation | undefined {
  if (!stationId) {
    return undefined;
  }
  return metroStations.find((station) => station.id === stationId);
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/ё/g, 'е').trim();
}

export function filterMetroStations(
  query: string,
  selectedStationId?: string | null,
): MetroStation[] {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    const popular = POPULAR_METRO_STATION_IDS.map((id) => findMetroStationById(id)).filter(
      (station): station is MetroStation => station !== undefined,
    );

    if (selectedStationId && !popular.some((station) => station.id === selectedStationId)) {
      const selected = findMetroStationById(selectedStationId);
      if (selected) {
        return [selected, ...popular];
      }
    }

    return popular;
  }

  return metroStations.filter((station) => normalizeQuery(station.name).includes(normalized));
}

export function formatMetroOriginCta(stationName: string): string {
  const genitive = METRO_GENITIVE_NAMES[stationName] ?? stationName;
  return `Считать от «${genitive}»`;
}

export function selectMetroOrigin(stationId: string): GeoOriginState {
  const current = getStoredGeoOriginState();
  const station = findMetroStationById(stationId) ?? findMetroStationById(DEFAULT_METRO_STATION_ID);
  const resolvedId = station?.id ?? DEFAULT_METRO_STATION_ID;

  return setStoredGeoOriginState({
    ...current,
    mode: 'metro',
    requestedOnce: true,
    metroStationId: resolvedId,
  });
}

export interface ResolvedGeoOrigin {
  origin: Location;
  kind: 'geolocation' | 'metro' | 'default';
  metroStation: MetroStation | null;
  needsMetroSelection: boolean;
}

export function resolveGeoOrigin(state: GeoOriginState): ResolvedGeoOrigin {
  const needsMetroSelection = state.permissionStatus === 'denied' && state.metroStationId === null;

  if (state.mode === 'metro' && state.metroStationId) {
    const station =
      findMetroStationById(state.metroStationId) ??
      findMetroStationById(DEFAULT_METRO_STATION_ID) ??
      null;
    if (station) {
      return {
        origin: station.location,
        kind: 'metro',
        metroStation: station,
        needsMetroSelection,
      };
    }
  }

  if (state.userLocation) {
    return {
      origin: state.userLocation,
      kind: 'geolocation',
      metroStation: null,
      needsMetroSelection,
    };
  }

  if (state.metroStationId) {
    const station = findMetroStationById(state.metroStationId) ?? null;
    if (station) {
      return {
        origin: station.location,
        kind: 'metro',
        metroStation: station,
        needsMetroSelection,
      };
    }
  }

  return {
    origin: GARDEN_RING_CENTER,
    kind: 'default',
    metroStation: null,
    needsMetroSelection,
  };
}

function hasBrowserGeolocation(): boolean {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return false;
  }
  const geo = navigator.geolocation as Geolocation | undefined;
  return Boolean(geo && typeof geo.getCurrentPosition === 'function');
}

export function requestBrowserGeolocation(options?: { force?: boolean }): Promise<GeoOriginState> {
  const current = getStoredGeoOriginState();
  const force = options?.force ?? false;

  if (!force && current.requestedOnce) {
    return Promise.resolve(current);
  }

  if (!hasBrowserGeolocation()) {
    if (force) {
      return Promise.resolve(
        setStoredGeoOriginState({
          ...current,
          permissionStatus: 'denied',
          requestedOnce: true,
        }),
      );
    }
    return Promise.resolve(current);
  }

  setGeolocationRequestInFlight(true);
  setStoredGeoOriginState({
    ...current,
    requestedOnce: true,
  });

  return new Promise<GeoOriginState>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latest = getStoredGeoOriginState();
        const updated = setStoredGeoOriginState({
          ...latest,
          mode: 'geolocation',
          permissionStatus: 'granted',
          requestedOnce: true,
          userLocation: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        });
        setGeolocationRequestInFlight(false);
        resolve(updated);
      },
      () => {
        const latest = getStoredGeoOriginState();
        const updated = setStoredGeoOriginState({
          ...latest,
          mode: latest.metroStationId ? 'metro' : 'geolocation',
          permissionStatus: 'denied',
          requestedOnce: true,
        });
        setGeolocationRequestInFlight(false);
        resolve(updated);
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 300_000,
      },
    );
  });
}

function subscribeGeoOrigin(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface UseGeoOriginResult extends ResolvedGeoOrigin {
  state: GeoOriginState;
  isLoading: boolean;
  selectMetro: (stationId: string) => GeoOriginState;
  requestGeolocation: (options?: { force?: boolean }) => Promise<GeoOriginState>;
}

export function useGeoOrigin(options?: { autoRequest?: boolean }): UseGeoOriginResult {
  const autoRequest = options?.autoRequest ?? true;
  const state = useSyncExternalStore(
    subscribeGeoOrigin,
    getStoredGeoOriginState,
    createDefaultGeoOriginState,
  );
  const isLoading = useSyncExternalStore(
    subscribeGeoOrigin,
    getIsGeolocationRequestInFlight,
    () => false,
  );

  useEffect(() => {
    if (!autoRequest) {
      return;
    }
    const current = getStoredGeoOriginState();
    if (current.requestedOnce || !hasBrowserGeolocation()) {
      return;
    }

    void requestBrowserGeolocation({ force: false });
  }, [autoRequest]);

  const resolved = resolveGeoOrigin(state);

  return {
    ...resolved,
    state,
    isLoading,
    selectMetro: (stationId: string) => selectMetroOrigin(stationId),
    requestGeolocation: (reqOptions?: { force?: boolean }) =>
      requestBrowserGeolocation({ force: reqOptions?.force ?? true }),
  };
}
