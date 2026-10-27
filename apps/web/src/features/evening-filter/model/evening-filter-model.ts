import type {
  EveningFilter,
  EveningFilterAt,
  FilteredPlace,
  FilterHour,
  Place,
  PlaceType,
  SavedPlace,
} from '@where-is-hype/core';
import {
  applyEveningFilter,
  defaultEveningFilter,
  eveningFilterSchema,
  filterHourSchema,
  getMoscowDayAndMinutes,
  NEAR_METRO_MAX_DISTANCE_M,
  placeTypeLabel,
  placeTypes,
  placeTypeSchema,
  resolveFilterDate,
} from '@where-is-hype/core';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router';

import { track } from '@/shared/lib/analytics';
import type { ChipOption } from '@/shared/ui/chip-group';

export const EVENING_FILTER_HOURS = [18, 19, 20, 21, 22, 23] as const;
export const EVENING_FILTER_CHECK_PRESETS = [1000, 1500, 2500, 4000] as const;

const FILTER_CRITERIA_KEYS = [
  'at',
  'hour',
  'types',
  'type',
  'maxCheck',
  'check',
  'price',
  'nearMetro',
  'metro',
] as const;

let rememberedFilterSearch: string | null = null;

export function rememberEveningFilterSearch(search: string): void {
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(normalized);
  params.delete('filter');
  const clean = params.toString();
  rememberedFilterSearch = clean.length > 0 ? clean : null;
}

export function consumeRememberedEveningFilterSearch(): string | null {
  const value = rememberedFilterSearch;
  rememberedFilterSearch = null;
  return value;
}

export function resetEveningFilterMemory(): void {
  rememberedFilterSearch = null;
}

export function extractFilterPlace(item: Place | SavedPlace): Place {
  return 'place' in item ? item.place : item;
}

export function formatFilterHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function formatFilterAtValue(at: EveningFilterAt): string {
  return at === 'now' ? 'now' : formatFilterHour(at);
}

export function parseFilterAt(raw: string | null | undefined): EveningFilterAt | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'now' || trimmed === 'сейчас') {
    return 'now';
  }

  const hourMatch = /^(\d{1,2})(?::00)?$/.exec(trimmed);
  if (!hourMatch) {
    return null;
  }

  const parsedNumber = Number(hourMatch[1]);
  const validated = filterHourSchema.safeParse(parsedNumber);
  return validated.success ? validated.data : null;
}

export function parseFilterTypes(rawValues: readonly string[]): PlaceType[] {
  const result: PlaceType[] = [];

  for (const raw of rawValues) {
    const parts = raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0);

    for (const part of parts) {
      const normalized = part === 'restaurant' ? 'rest' : part;
      const parsed = placeTypeSchema.safeParse(normalized);
      if (parsed.success && !result.includes(parsed.data)) {
        result.push(parsed.data);
      }
    }
  }

  return result;
}

export function parseFilterMaxCheck(raw: string | null | undefined): number | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === 'any' || trimmed === 'null') {
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.round(num);
}

export function parseFilterNearMetro(raw: string | null | undefined): boolean {
  if (!raw) {
    return false;
  }
  const trimmed = raw.trim().toLowerCase();
  return trimmed === '1' || trimmed === 'true' || trimmed === 'yes';
}

export function isDefaultEveningFilter(filter: EveningFilter): boolean {
  return (
    filter.at === 'now' &&
    filter.types.length === 0 &&
    filter.maxCheck === null &&
    !filter.nearMetro
  );
}

export interface ParsedEveningFilterUrlState {
  filter: EveningFilter;
  isOpen: boolean;
  isActive: boolean;
}

export function parseEveningFilterSearchParams(
  input: URLSearchParams | string,
): ParsedEveningFilterUrlState {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;

  const rawOpen = params.get('filter')?.trim().toLowerCase();
  const isOpen = rawOpen === '1' || rawOpen === 'true' || rawOpen === 'open';

  const parsedAt = parseFilterAt(params.get('at') ?? params.get('hour'));
  const rawTypes = [...params.getAll('types'), ...params.getAll('type')];
  const types = parseFilterTypes(rawTypes);
  const maxCheck = parseFilterMaxCheck(
    params.get('maxCheck') ?? params.get('check') ?? params.get('price'),
  );
  const nearMetro = parseFilterNearMetro(params.get('nearMetro') ?? params.get('metro'));

  const filter: EveningFilter = {
    at: parsedAt ?? 'now',
    types,
    maxCheck,
    nearMetro,
  };

  const hasExplicitCriteria =
    parsedAt !== null || types.length > 0 || maxCheck !== null || nearMetro;

  return {
    filter,
    isOpen,
    isActive: hasExplicitCriteria,
  };
}

export function serializeEveningFilterSearchParams(
  filter: EveningFilter,
  options: {
    isOpen?: boolean | undefined;
    isActive?: boolean | undefined;
    baseParams?: URLSearchParams | undefined;
  } = {},
): URLSearchParams {
  const next = new URLSearchParams(options.baseParams);

  next.delete('filter');
  for (const key of FILTER_CRITERIA_KEYS) {
    next.delete(key);
  }

  if (options.isOpen) {
    next.set('filter', '1');
  }

  const shouldWriteCriteria = options.isActive ?? !isDefaultEveningFilter(filter);
  if (shouldWriteCriteria) {
    next.set('at', String(filter.at));
    if (filter.types.length > 0) {
      next.set('types', filter.types.join(','));
    }
    if (filter.maxCheck !== null) {
      next.set('maxCheck', String(filter.maxCheck));
    }
    if (filter.nearMetro) {
      next.set('nearMetro', '1');
    }
  }

  return next;
}

export function getAvailableEveningHours(
  now: Date = new Date(),
  selectedAt?: EveningFilterAt,
): FilterHour[] {
  const { minutes } = getMoscowDayAndMinutes(now);
  const currentHour = Math.floor(minutes / 60);
  const startHour = Math.max(18, currentHour + 1);
  const hours: FilterHour[] = [];

  if (currentHour <= 22) {
    for (let hour = startHour; hour <= 23; hour += 1) {
      const parsed = filterHourSchema.safeParse(hour);
      if (parsed.success) {
        hours.push(parsed.data);
      }
    }
  }

  if (typeof selectedAt === 'number' && !hours.includes(selectedAt)) {
    const parsedSelected = filterHourSchema.safeParse(selectedAt);
    if (parsedSelected.success) {
      hours.push(parsedSelected.data);
      hours.sort((a, b) => a - b);
    }
  }

  return hours;
}

export function getEveningHourChipOptions(
  now: Date = new Date(),
  selectedAt?: EveningFilterAt,
): ChipOption[] {
  const availableHours = getAvailableEveningHours(now, selectedAt);
  const options: ChipOption[] = [{ value: 'now', label: 'Сейчас' }];

  for (const hour of availableHours) {
    const formatted = formatFilterHour(hour);
    options.push({
      value: formatted,
      label: formatted,
      mono: true,
    });
  }

  return options;
}

export const EVENING_PLACE_TYPE_OPTIONS: readonly ChipOption<PlaceType>[] = placeTypes.map(
  (type) => ({
    value: type,
    label: placeTypeLabel[type],
  }),
);

export const EVENING_PRICE_OPTIONS: readonly ChipOption[] = [
  { value: 'any', label: 'Любой' },
  ...EVENING_FILTER_CHECK_PRESETS.map((amount) => ({
    value: String(amount),
    label: `до ${String(amount)} ₽`,
  })),
];

export interface FilteredEveningResult<T extends Place | SavedPlace = Place | SavedPlace> {
  matchedItems: T[];
  filteredPlaces: FilteredPlace[];
  matchedPlaceIds: Set<string>;
  mutedPlaceIds: Set<string>;
  targetDate: Date;
}

export function filterEveningItems<T extends Place | SavedPlace>(
  items: readonly T[],
  filter: EveningFilter,
  now: Date = new Date(),
): FilteredEveningResult<T> {
  const places = items.map((item) => extractFilterPlace(item));
  const filteredPlaces = applyEveningFilter(places, filter, now);
  const matchedPlaceIds = new Set(filteredPlaces.map((place) => place.id));
  const matchedItems: T[] = [];
  const mutedPlaceIds = new Set<string>();

  for (const item of items) {
    const place = extractFilterPlace(item);
    if (matchedPlaceIds.has(place.id)) {
      matchedItems.push(item);
    } else {
      mutedPlaceIds.add(place.id);
    }
  }

  return {
    matchedItems,
    filteredPlaces,
    matchedPlaceIds,
    mutedPlaceIds,
    targetDate: resolveFilterDate(filter.at, now),
  };
}

const SINGLE_TYPE_NOUN_LOWER: Record<PlaceType, string> = {
  coffee: 'кофейня',
  cafe: 'кафе',
  rest: 'ресторан',
  bar: 'бар',
};

const SINGLE_TYPE_VERB: Record<PlaceType, string> = {
  coffee: 'не нашлась',
  cafe: 'не нашлось',
  rest: 'не нашёлся',
  bar: 'не нашёлся',
};

export function formatEmptyFilterDescription(filter: EveningFilter): string {
  const timePrefix = filter.at === 'now' ? 'Сейчас' : `В ${formatFilterHour(filter.at)}`;
  const singleType = filter.types.length === 1 ? filter.types[0] : undefined;

  const subject = singleType
    ? SINGLE_TYPE_NOUN_LOWER[singleType]
    : filter.types.length > 1
      ? filter.types.map((type) => SINGLE_TYPE_NOUN_LOWER[type]).join(' или ')
      : 'место';

  const checkPart = filter.maxCheck !== null ? ` до ${String(filter.maxCheck)} ₽` : '';
  const metroPart = filter.nearMetro ? ' у метро' : '';
  const verb =
    singleType !== undefined
      ? SINGLE_TYPE_VERB[singleType]
      : filter.types.length > 1
        ? 'не нашлись'
        : 'не нашлось';

  return `${timePrefix} ${subject}${checkPart}${metroPart} ${verb}. Сбросить фильтры?`;
}

export interface FilterRelaxation {
  id: string;
  label: string;
  count: number;
  filter: EveningFilter;
}

export function buildFilterRelaxations(
  items: readonly (Place | SavedPlace)[],
  filter: EveningFilter,
  now: Date = new Date(),
): FilterRelaxation[] {
  const places = items.map((item) => extractFilterPlace(item));
  if (places.length === 0) {
    return [];
  }

  const relaxations: FilterRelaxation[] = [];

  if (filter.maxCheck !== null) {
    const nextFilter: EveningFilter = { ...filter, maxCheck: null };
    const count = applyEveningFilter(places, nextFilter, now).length;
    if (count > 0) {
      relaxations.push({
        id: 'without-check',
        label: `Без «до ${String(filter.maxCheck)} ₽»`,
        count,
        filter: nextFilter,
      });
    }
  }

  if (filter.nearMetro) {
    const nextFilter: EveningFilter = { ...filter, nearMetro: false };
    const count = applyEveningFilter(places, nextFilter, now).length;
    if (count > 0) {
      relaxations.push({
        id: 'without-metro',
        label: 'Без «до 1 км от метро»',
        count,
        filter: nextFilter,
      });
    }
  }

  if (filter.types.length > 0) {
    const nextFilter: EveningFilter = { ...filter, types: [] };
    const count = applyEveningFilter(places, nextFilter, now).length;
    if (count > 0) {
      relaxations.push({
        id: 'all-types',
        label: 'Все типы',
        count,
        filter: nextFilter,
      });
    }
  }

  if (filter.at !== 'now') {
    const candidateHours: EveningFilterAt[] = [21, 20, 19, 18, 'now'];
    for (const candidateAt of candidateHours) {
      if (candidateAt === filter.at) {
        continue;
      }
      const nextFilter: EveningFilter = { ...filter, at: candidateAt };
      const count = applyEveningFilter(places, nextFilter, now).length;
      if (count > 0) {
        const label = candidateAt === 'now' ? 'Сейчас' : `В ${formatFilterHour(candidateAt)}`;
        relaxations.push({
          id: `at-${String(candidateAt)}`,
          label,
          count,
          filter: nextFilter,
        });
        break;
      }
    }
  }

  return relaxations.slice(0, 3);
}

export function trackEveningFilterApplied(
  filter: EveningFilter,
  matchedCount: number,
  totalCount: number,
): void {
  track('filter_applied', {
    at: String(filter.at),
    types: filter.types.join(','),
    maxCheck: filter.maxCheck,
    nearMetro: filter.nearMetro,
    matchedCount,
    totalCount,
  });
}

export interface UseEveningFilterOptions<T extends Place | SavedPlace = Place | SavedPlace> {
  items: readonly T[];
  now?: Date | undefined;
}

export interface UseEveningFilterResult<T extends Place | SavedPlace = Place | SavedPlace> {
  filter: EveningFilter;
  isOpen: boolean;
  isActive: boolean;
  matchedItems: T[];
  matchedCount: number;
  totalCount: number;
  matchedPlaceIds: Set<string>;
  mutedPlaceIds: Set<string>;
  targetDate: Date;
  relaxations: FilterRelaxation[];
  openFilter: () => void;
  closeFilter: () => void;
  applyAndCloseFilter: () => void;
  updateFilter: (patch: Partial<EveningFilter>, options?: { keepOpen?: boolean }) => void;
  resetFilter: (options?: { keepOpen?: boolean }) => void;
}

export function useEveningFilter<T extends Place | SavedPlace = Place | SavedPlace>({
  items,
  now,
}: UseEveningFilterOptions<T>): UseEveningFilterResult<T> {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const effectiveNow = useMemo(() => now ?? new Date(), [now]);

  const { filter, isOpen, isActive } = useMemo(
    () => parseEveningFilterSearchParams(searchParams),
    [searchParams],
  );

  useEffect(() => {
    if (location.pathname !== '/') {
      return;
    }
    if (isActive || isOpen) {
      rememberedFilterSearch = null;
      return;
    }
    const remembered = consumeRememberedEveningFilterSearch();
    if (remembered) {
      setSearchParams(new URLSearchParams(remembered), { replace: true });
    }
  }, [isActive, isOpen, location.pathname, setSearchParams]);

  const filteredResult = useMemo(
    () => filterEveningItems(items, filter, effectiveNow),
    [items, filter, effectiveNow],
  );

  const relaxations = useMemo(
    () =>
      filteredResult.matchedItems.length === 0
        ? buildFilterRelaxations(items, filter, effectiveNow)
        : [],
    [items, filter, effectiveNow, filteredResult.matchedItems.length],
  );

  const openFilter = useCallback(() => {
    const next = serializeEveningFilterSearchParams(filter, {
      isOpen: true,
      isActive,
      baseParams: searchParams,
    });
    setSearchParams(next);
  }, [filter, isActive, searchParams, setSearchParams]);

  const closeFilter = useCallback(() => {
    const next = serializeEveningFilterSearchParams(filter, {
      isOpen: false,
      isActive,
      baseParams: searchParams,
    });
    setSearchParams(next, { replace: true });
  }, [filter, isActive, searchParams, setSearchParams]);

  const updateFilter = useCallback(
    (patch: Partial<EveningFilter>, options?: { keepOpen?: boolean }) => {
      const nextFilter: EveningFilter = {
        ...filter,
        ...patch,
      };
      const nextMatched = filterEveningItems(items, nextFilter, effectiveNow);
      const keepOpen = options?.keepOpen ?? isOpen;

      const nextParams = serializeEveningFilterSearchParams(nextFilter, {
        isOpen: keepOpen,
        isActive: true,
        baseParams: searchParams,
      });

      setSearchParams(nextParams, { replace: true });
      trackEveningFilterApplied(nextFilter, nextMatched.matchedItems.length, items.length);
    },
    [effectiveNow, filter, isOpen, items, searchParams, setSearchParams],
  );

  const applyAndCloseFilter = useCallback(() => {
    const nextParams = serializeEveningFilterSearchParams(filter, {
      isOpen: false,
      isActive: true,
      baseParams: searchParams,
    });
    setSearchParams(nextParams, { replace: true });
    if (!isActive) {
      trackEveningFilterApplied(filter, filteredResult.matchedItems.length, items.length);
    }
  }, [
    filter,
    filteredResult.matchedItems.length,
    isActive,
    items.length,
    searchParams,
    setSearchParams,
  ]);

  const resetFilter = useCallback(
    (options?: { keepOpen?: boolean }) => {
      resetEveningFilterMemory();
      const keepOpen = options?.keepOpen ?? false;
      const nextParams = serializeEveningFilterSearchParams(defaultEveningFilter, {
        isOpen: keepOpen,
        isActive: false,
        baseParams: searchParams,
      });
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return {
    filter,
    isOpen,
    isActive,
    matchedItems: filteredResult.matchedItems,
    matchedCount: filteredResult.matchedItems.length,
    totalCount: items.length,
    matchedPlaceIds: filteredResult.matchedPlaceIds,
    mutedPlaceIds: filteredResult.mutedPlaceIds,
    targetDate: filteredResult.targetDate,
    relaxations,
    openFilter,
    closeFilter,
    applyAndCloseFilter,
    updateFilter,
    resetFilter,
  };
}

export {
  applyEveningFilter,
  defaultEveningFilter,
  eveningFilterSchema,
  NEAR_METRO_MAX_DISTANCE_M,
  resolveFilterDate,
};
export type { EveningFilter, EveningFilterAt, FilteredPlace, FilterHour };
