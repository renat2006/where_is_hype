import { queryOptions, useMutation } from '@tanstack/react-query';
import type { Candidate, Place } from '@where-is-hype/core';
import { candidateSchema, placeSchema } from '@where-is-hype/core';
import { z } from 'zod';

import type { ReportPlaceInput, ReportPlaceResponse, ResolveLinkInput } from '@/shared/api';
import { apiGet, apiPost, reportPlaceResponseSchema } from '@/shared/api';

const placeListSchema = z.array(placeSchema);
const candidateListSchema = z.array(candidateSchema);

export async function fetchPlaces(init?: RequestInit): Promise<Place[]> {
  return apiGet('/places', placeListSchema, init);
}

export async function searchPlaces(query: string, init?: RequestInit): Promise<Place[]> {
  const normalized = query.trim();
  if (normalized.length < 2) {
    return [];
  }
  return apiGet(`/places/search?q=${encodeURIComponent(normalized)}`, placeListSchema, init);
}

export async function resolvePlaceLink(
  input: ResolveLinkInput | string,
  init?: RequestInit,
): Promise<Candidate[]> {
  const url = typeof input === 'string' ? input : input.url;
  return apiPost('/links/resolve', candidateListSchema, { url }, init);
}

export const resolveLink = resolvePlaceLink;

export async function reportMissingPlace(
  input: ReportPlaceInput,
  init?: RequestInit,
): Promise<ReportPlaceResponse> {
  return apiPost('/reports', reportPlaceResponseSchema, input, init);
}

export const reportPlace = reportMissingPlace;

export const placeQueries = {
  all: () => ['places'] as const,
  list: () =>
    queryOptions({
      queryKey: ['places', 'list'] as const,
      queryFn: ({ signal }) => fetchPlaces({ signal }),
    }),
  search: (query: string) => {
    const normalized = query.trim();
    return queryOptions({
      queryKey: ['places', 'search', normalized] as const,
      queryFn: ({ signal }) => searchPlaces(normalized, { signal }),
      enabled: normalized.length >= 2,
    });
  },
  resolveLink: (url: string) => {
    const normalized = url.trim();
    return queryOptions({
      queryKey: ['places', 'resolve', normalized] as const,
      queryFn: ({ signal }) => resolvePlaceLink({ url: normalized }, { signal }),
      enabled: normalized.length > 0,
    });
  },
};

export function useResolveLinkMutation() {
  return useMutation({
    mutationFn: (input: ResolveLinkInput | string) => resolvePlaceLink(input),
  });
}

export const useResolvePlaceLinkMutation = useResolveLinkMutation;

export function useReportPlaceMutation() {
  return useMutation({
    mutationFn: (input: ReportPlaceInput) => reportMissingPlace(input),
  });
}

export const useReportMissingPlaceMutation = useReportPlaceMutation;
