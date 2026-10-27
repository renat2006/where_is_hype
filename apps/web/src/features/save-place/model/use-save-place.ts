import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Place, SavedPlace } from '@where-is-hype/core';
import { useCallback, useMemo, useState } from 'react';

import { savedPlaceQueries, useSavePlaceMutation } from '@/entities/saved-place';
import { ApiError } from '@/shared/api';
import { track } from '@/shared/lib/analytics';
import { showToast } from '@/shared/ui/toast';

export type SavePlaceSource = 'link' | 'name';

export type SavePlaceOutcome =
  { status: 'saved'; savedPlace: SavedPlace } | { status: 'already_saved'; placeId: string };

export interface UseSavePlaceFlowOptions {
  onSaved?: ((savedPlace: SavedPlace, source: SavePlaceSource) => void) | undefined;
  onAlreadySaved?: ((placeId: string, place: Place) => void) | undefined;
  toastMessage?: string | undefined;
}

export function isAlreadySavedError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 409 || error.code === 'ALREADY_SAVED');
}

export function normalizeSourceUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }
  const trimmed = rawUrl.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function useSavePlaceFlow(options?: UseSavePlaceFlowOptions) {
  const onSaved = options?.onSaved;
  const onAlreadySaved = options?.onAlreadySaved;
  const toastMessage = options?.toastMessage;

  const queryClient = useQueryClient();
  const savedPlacesQuery = useQuery(savedPlaceQueries.list());
  const saveMutation = useSavePlaceMutation();

  const [extraSavedIds, setExtraSavedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedPlaceIds = useMemo(() => {
    const ids = new Set<string>(extraSavedIds);
    for (const item of savedPlacesQuery.data ?? []) {
      ids.add(item.place.id);
    }
    return ids;
  }, [extraSavedIds, savedPlacesQuery.data]);

  const isPlaceAlreadySaved = useCallback(
    (placeId: string): boolean => savedPlaceIds.has(placeId),
    [savedPlaceIds],
  );

  const markAsAlreadySaved = useCallback((...placeIds: string[]) => {
    setExtraSavedIds((prev) => {
      const next = new Set(prev);
      for (const id of placeIds) {
        if (id) {
          next.add(id);
        }
      }
      return next;
    });
  }, []);

  const savePlaceWithFeedback = useCallback(
    async (
      place: Place,
      params: {
        source: SavePlaceSource;
        sourceUrl?: string | null | undefined;
      },
    ): Promise<SavePlaceOutcome> => {
      const normalizedUrl = normalizeSourceUrl(params.sourceUrl);
      setSavingPlaceId(place.id);
      setSaveError(null);

      try {
        const savedPlace = await saveMutation.mutateAsync({
          placeId: place.id,
          sourceUrl: normalizedUrl,
        });

        track('place_saved', {
          source: params.source,
          via: params.source,
          placeId: savedPlace.place.id,
          ...(normalizedUrl ? { sourceUrl: normalizedUrl } : {}),
        });

        showToast({
          message: toastMessage ?? 'Место сохранено',
          showCountdown: false,
        });

        onSaved?.(savedPlace, params.source);
        return { status: 'saved', savedPlace };
      } catch (error: unknown) {
        if (isAlreadySavedError(error)) {
          const existingPlaceId = error.placeId ?? place.id;
          markAsAlreadySaved(place.id, existingPlaceId);
          await queryClient.invalidateQueries({ queryKey: savedPlaceQueries.all() });
          onAlreadySaved?.(existingPlaceId, place);
          return { status: 'already_saved', placeId: existingPlaceId };
        }

        setSaveError('Не сохранилось. Попробуй ещё раз.');
        throw error;
      } finally {
        setSavingPlaceId(null);
      }
    },
    [markAsAlreadySaved, onAlreadySaved, onSaved, queryClient, saveMutation, toastMessage],
  );

  return {
    savedPlaces: savedPlacesQuery.data ?? [],
    savedPlaceIds,
    isPlaceAlreadySaved,
    markAsAlreadySaved,
    savePlaceWithFeedback,
    savingPlaceId,
    isSaving: saveMutation.isPending,
    saveError,
    clearSaveError: () => {
      setSaveError(null);
    },
  };
}
