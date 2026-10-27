import { QueryClient, QueryClientContext, useQueryClient } from '@tanstack/react-query';
import type { SavedPlace } from '@where-is-hype/core';
import { useCallback, useContext, useState } from 'react';

import { deleteSavedPlace, savedPlaceQueries } from '@/entities/saved-place';
import { DEFAULT_TOAST_DURATION_MS, showToast } from '@/shared/ui/toast';

export const DELETE_PLACE_TOAST_DURATION_MS = DEFAULT_TOAST_DURATION_MS;
export const DELETE_PLACE_TOAST_MESSAGE = 'Место удалено';
export const DELETE_PLACE_UNDO_LABEL = 'Отменить';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});

export interface UseDeletePlaceOptions {
  placeId: string;
  durationMs?: number | undefined;
  onDeleted?: ((placeId: string) => void) | undefined;
  onUndo?: ((placeId: string) => void) | undefined;
}

export function useDeletePlace({
  placeId,
  durationMs = DELETE_PLACE_TOAST_DURATION_MS,
  onDeleted,
  onUndo,
}: UseDeletePlaceOptions) {
  const contextQueryClient = useContext(QueryClientContext);
  const queryClient = useQueryClient(contextQueryClient ?? fallbackQueryClient);
  const [isPendingDelete, setIsPendingDelete] = useState(false);

  const triggerDelete = useCallback(() => {
    const listQueryKey = savedPlaceQueries.list().queryKey;
    const previousList = queryClient.getQueryData<SavedPlace[]>(listQueryKey);

    if (previousList) {
      queryClient.setQueryData<SavedPlace[]>(
        listQueryKey,
        previousList.filter((item) => item.place.id !== placeId),
      );
    }

    setIsPendingDelete(true);

    showToast({
      id: `delete-place-${placeId}`,
      message: DELETE_PLACE_TOAST_MESSAGE,
      actionLabel: DELETE_PLACE_UNDO_LABEL,
      durationMs,
      showCountdown: true,
      onUndo: () => {
        setIsPendingDelete(false);
        if (previousList) {
          queryClient.setQueryData<SavedPlace[]>(listQueryKey, previousList);
        }
        onUndo?.(placeId);
      },
      onExpire: () => {
        setIsPendingDelete(false);
        onDeleted?.(placeId);
        void deleteSavedPlace(placeId)
          .catch(() => undefined)
          .finally(() => {
            void queryClient.invalidateQueries({ queryKey: savedPlaceQueries.all() });
          });
      },
    });
  }, [durationMs, onDeleted, onUndo, placeId, queryClient]);

  return {
    triggerDelete,
    isPendingDelete,
  };
}
