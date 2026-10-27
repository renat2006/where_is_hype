import { useQuery } from '@tanstack/react-query';
import type { Place } from '@where-is-hype/core';
import { placeTypeLabel } from '@where-is-hype/core';
import { useCallback, useMemo, useState } from 'react';

import {
  canSearchPlaces,
  placeQueries,
  searchPlaces,
  useReportPlaceMutation,
} from '@/entities/place';
import type { TextFieldSuggestion } from '@/shared/ui/text-field';
import { showToast } from '@/shared/ui/toast';

export function formatPlaceSuggestionSubtitle(place: Place, isSaved = false): string {
  const base = `${placeTypeLabel[place.type]} · ${place.address} · ${place.metro.name}`;
  return isSaved ? `${base} · Уже в твоих местах` : base;
}

export function mapPlaceToSuggestion(
  place: Place,
  savedPlaceIds?: ReadonlySet<string>,
): TextFieldSuggestion {
  const isSaved = savedPlaceIds?.has(place.id) ?? false;
  return {
    id: place.id,
    title: place.name,
    subtitle: formatPlaceSuggestionSubtitle(place, isSaved),
  };
}

export interface UseSearchPlaceFlowOptions {
  initialQuery?: string | undefined;
  savedPlaceIds?: ReadonlySet<string> | undefined;
  onReported?: ((query: string) => void) | undefined;
}

export function useSearchPlaceFlow(options?: UseSearchPlaceFlowOptions) {
  const savedPlaceIds = options?.savedPlaceIds;
  const onReported = options?.onReported;

  const [query, setQuery] = useState(options?.initialQuery ?? '');
  const [reportedQuery, setReportedQuery] = useState<string | null>(null);

  const isSearchable = canSearchPlaces(query);
  const searchQuery = useQuery({
    ...placeQueries.search(query),
    queryFn: () => searchPlaces(query),
  });
  const reportMutation = useReportPlaceMutation();

  const places = useMemo(
    () => (isSearchable ? (searchQuery.data ?? []) : []),
    [isSearchable, searchQuery.data],
  );

  const suggestions = useMemo(() => {
    if (!isSearchable) {
      return undefined;
    }
    return places.map((place) => mapPlaceToSuggestion(place, savedPlaceIds));
  }, [isSearchable, places, savedPlaceIds]);

  const submitMissingReport = useCallback(
    async (sourceUrl?: string | null) => {
      const trimmedQuery = query.trim() || 'Неизвестное место';
      const normalizedUrl = sourceUrl?.trim() ? sourceUrl.trim() : null;

      await reportMutation.mutateAsync({
        query: trimmedQuery,
        sourceUrl: normalizedUrl,
      });

      setReportedQuery(trimmedQuery);
      showToast({
        message: 'Заявка отправлена',
        showCountdown: false,
      });
      onReported?.(trimmedQuery);
    },
    [onReported, query, reportMutation],
  );

  return {
    query,
    setQuery,
    isSearchable,
    places,
    suggestions,
    isLoading: isSearchable && searchQuery.isFetching,
    isReporting: reportMutation.isPending,
    hasReportedCurrentQuery: reportedQuery !== null && reportedQuery === query.trim(),
    submitMissingReport,
  };
}
