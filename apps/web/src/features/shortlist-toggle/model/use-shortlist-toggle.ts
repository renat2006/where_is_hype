import { QueryClient, QueryClientContext, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Place, SavedPlace, Shortlist } from '@where-is-hype/core';
import { createShortlistExpiresAt } from '@where-is-hype/core';
import { useCallback, useContext, useState } from 'react';

import { placeQueries } from '@/entities/place';
import { savedPlaceQueries } from '@/entities/saved-place';
import {
  canAddToShortlist,
  isInShortlist,
  SHORTLIST_MAX_PLACES,
  shortlistQueries,
  toggleShortlistPlaceIds,
  updateMyShortlist,
} from '@/entities/shortlist';
import { placesFixture } from '@/shared/api';

export const SHORTLIST_ADD_LABEL = 'В «На вечер»';
export const SHORTLIST_ADDED_LABEL = 'Уже в «На вечер»';
export const SHORTLIST_LIMIT_CAPTION = 'Уже 5 мест';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});

function resolvePlaceById(queryClient: QueryClient, placeId: string): Place | undefined {
  const savedPlaces = queryClient.getQueryData<SavedPlace[]>(savedPlaceQueries.list().queryKey);
  const fromSaved = savedPlaces?.find((item) => item.place.id === placeId)?.place;
  if (fromSaved) {
    return fromSaved;
  }

  const catalogPlaces = queryClient.getQueryData<Place[]>(placeQueries.list().queryKey);
  const fromCatalog = catalogPlaces?.find((item) => item.id === placeId);
  if (fromCatalog) {
    return fromCatalog;
  }

  return placesFixture.find((item) => item.id === placeId);
}

function buildOptimisticShortlist(
  current: Shortlist | undefined,
  nextPlaceIds: readonly string[],
  queryClient: QueryClient,
): Shortlist {
  const createdAt = current?.createdAt ?? new Date().toISOString();
  const existingMap = new Map<string, Place>();
  for (const place of current?.places ?? []) {
    existingMap.set(place.id, place);
  }

  const resolvedPlaces: Place[] = [];
  for (const id of nextPlaceIds) {
    const place = existingMap.get(id) ?? resolvePlaceById(queryClient, id);
    if (place) {
      resolvedPlaces.push(place);
    }
  }

  const validIds = new Set(resolvedPlaces.map((p) => p.id));
  const filteredVotes = (current?.votes ?? [])
    .map((vote) => ({
      ...vote,
      placeIds: vote.placeIds.filter((id) => validIds.has(id)),
    }))
    .filter((vote) => vote.placeIds.length > 0);

  return {
    token: current?.token ?? 'evening-demo',
    places: resolvedPlaces,
    createdAt,
    expiresAt: current?.expiresAt ?? createShortlistExpiresAt(createdAt),
    votes: filteredVotes,
  };
}

export function useShortlistState() {
  const contextQueryClient = useContext(QueryClientContext);
  const activeQueryClient = contextQueryClient ?? fallbackQueryClient;
  const queryClient = useQueryClient(activeQueryClient);
  const [isMutating, setIsMutating] = useState(false);

  const shortlistQuery = useQuery(shortlistQueries.mine(), activeQueryClient);
  const shortlist = shortlistQuery.data;
  const placeIds = shortlist?.places.map((place) => place.id) ?? [];
  const count = placeIds.length;
  const canAdd = canAddToShortlist(shortlist);

  const togglePlace = useCallback(
    async (placeId: string): Promise<{ inEvening: boolean; placeIds: string[] }> => {
      const mineKey = shortlistQueries.mine().queryKey;
      const latestShortlist = queryClient.getQueryData<Shortlist>(mineKey) ?? shortlist;
      const currentIds = latestShortlist?.places.map((place) => place.id) ?? [];
      const wasInEvening = currentIds.includes(placeId);

      if (!wasInEvening && currentIds.length >= SHORTLIST_MAX_PLACES) {
        return { inEvening: false, placeIds: currentIds };
      }

      const nextPlaceIds = toggleShortlistPlaceIds(currentIds, placeId);

      const optimistic = buildOptimisticShortlist(latestShortlist, nextPlaceIds, queryClient);
      queryClient.setQueryData<Shortlist>(mineKey, optimistic);

      setIsMutating(true);
      try {
        const updated = await updateMyShortlist(nextPlaceIds);
        queryClient.setQueryData<Shortlist>(mineKey, updated);
        await queryClient.invalidateQueries({ queryKey: shortlistQueries.all() });
        return {
          inEvening: updated.places.some((p) => p.id === placeId),
          placeIds: updated.places.map((p) => p.id),
        };
      } catch {
        if (latestShortlist) {
          queryClient.setQueryData<Shortlist>(mineKey, latestShortlist);
        }
        return { inEvening: wasInEvening, placeIds: currentIds };
      } finally {
        setIsMutating(false);
      }
    },
    [queryClient, shortlist],
  );

  return {
    shortlist,
    placeIds,
    count,
    canAdd,
    isLoading: shortlistQuery.isLoading,
    isPending: isMutating,
    togglePlace,
  };
}

export interface UseShortlistToggleOptions {
  placeId: string;
  onToggled?: ((inEvening: boolean, placeIds: string[]) => void) | undefined;
}

export function useShortlistToggle({ placeId, onToggled }: UseShortlistToggleOptions) {
  const { shortlist, placeIds, count, canAdd, isLoading, isPending, togglePlace } =
    useShortlistState();

  const inEvening = isInShortlist(shortlist, placeId);
  const isLimitReached = !inEvening && !canAdd;
  const label = inEvening ? SHORTLIST_ADDED_LABEL : SHORTLIST_ADD_LABEL;
  const limitNote = isLimitReached ? SHORTLIST_LIMIT_CAPTION : undefined;

  const toggle = useCallback(async () => {
    if (isLimitReached) {
      return;
    }
    const result = await togglePlace(placeId);
    onToggled?.(result.inEvening, result.placeIds);
  }, [isLimitReached, onToggled, placeId, togglePlace]);

  return {
    shortlist,
    placeIds,
    count,
    inEvening,
    canAdd,
    isLimitReached,
    disabled: isLimitReached,
    label,
    limitNote,
    isLoading,
    isPending,
    toggle,
  };
}
