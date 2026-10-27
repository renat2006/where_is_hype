import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SavedPlace } from '@where-is-hype/core';
import { savedPlaceSchema } from '@where-is-hype/core';
import { z } from 'zod';

import type {
  MarkVisitInput,
  SavePlaceInput,
  UpdateNoteInput,
  UpdateVisitExpectationInput,
} from '@/shared/api';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/api';

const savedPlaceListSchema = z.array(savedPlaceSchema);

export async function getSavedPlaces(init?: RequestInit): Promise<SavedPlace[]> {
  return apiGet('/me/places', savedPlaceListSchema, init);
}

export async function savePlace(input: SavePlaceInput, init?: RequestInit): Promise<SavedPlace> {
  return apiPost('/me/places', savedPlaceSchema, input, init);
}

export async function updateSavedPlaceNote(
  input: UpdateNoteInput,
  init?: RequestInit,
): Promise<SavedPlace> {
  return apiPatch(
    `/me/places/${encodeURIComponent(input.placeId)}`,
    savedPlaceSchema,
    { note: input.note },
    init,
  );
}

export async function deleteSavedPlace(placeId: string, init?: RequestInit): Promise<void> {
  await apiDelete(`/me/places/${encodeURIComponent(placeId)}`, init);
}

export async function markPlaceVisit(
  input: MarkVisitInput,
  init?: RequestInit,
): Promise<SavedPlace> {
  const { placeId, ...payload } = input;
  return apiPost(
    `/me/places/${encodeURIComponent(placeId)}/visits`,
    savedPlaceSchema,
    payload,
    init,
  );
}

export async function updateVisitExpectation(
  input: UpdateVisitExpectationInput,
  init?: RequestInit,
): Promise<SavedPlace> {
  const { placeId, ...payload } = input;
  return apiPatch(
    `/me/places/${encodeURIComponent(placeId)}/visits`,
    savedPlaceSchema,
    payload,
    init,
  );
}

export async function seedDemoPlaces(init?: RequestInit): Promise<SavedPlace[]> {
  return apiPost('/demo/seed', savedPlaceListSchema, undefined, init);
}

export const savedPlaceQueries = {
  all: () => ['saved-places'] as const,
  list: () =>
    queryOptions({
      queryKey: ['saved-places', 'list'] as const,
      queryFn: ({ signal }) => getSavedPlaces({ signal }),
    }),
  detail: (placeId: string) =>
    queryOptions({
      queryKey: ['saved-places', 'detail', placeId] as const,
      queryFn: async ({ signal }) => {
        const list = await getSavedPlaces({ signal });
        return list.find((item) => item.place.id === placeId) ?? null;
      },
      enabled: placeId.length > 0,
    }),
};

export function useSavePlaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SavePlaceInput) => savePlace(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedPlaceQueries.all() });
    },
  });
}

export function useUpdatePlaceNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateNoteInput) => updateSavedPlaceNote(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedPlaceQueries.all() });
    },
  });
}

export const useUpdateSavedPlaceNoteMutation = useUpdatePlaceNoteMutation;

export function useDeletePlaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => deleteSavedPlace(placeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedPlaceQueries.all() });
    },
  });
}

export const useDeleteSavedPlaceMutation = useDeletePlaceMutation;

export function useMarkVisitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MarkVisitInput) => markPlaceVisit(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedPlaceQueries.all() });
    },
  });
}

export const useMarkPlaceVisitMutation = useMarkVisitMutation;

export function useUpdateVisitExpectationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateVisitExpectationInput) => updateVisitExpectation(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedPlaceQueries.all() });
    },
  });
}

export function useSeedDemoPlacesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => seedDemoPlaces(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedPlaceQueries.all() });
    },
  });
}

export const useDemoSeedMutation = useSeedDemoPlacesMutation;
