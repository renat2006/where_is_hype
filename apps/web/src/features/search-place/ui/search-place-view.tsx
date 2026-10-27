import type { Place } from '@where-is-hype/core';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';

import { CandidateCard } from '@/entities/place';
import { Button } from '@/shared/ui/button';
import { TextField } from '@/shared/ui/text-field';

import { useSearchPlaceFlow } from './search-place-flow';

export interface SearchPlaceViewProps {
  sourceUrl?: string | undefined;
  onSourceUrlChange?: ((url: string) => void) | undefined;
  unrecognized?: boolean | undefined;
  savedPlaceIds: ReadonlySet<string>;
  savingPlaceId?: string | null | undefined;
  saveError?: string | null | undefined;
  onSelectPlace: (place: Place) => void;
  onOpenPlace: (place: Place) => void;
  onBack: () => void;
}

export function SearchPlaceView({
  sourceUrl = '',
  onSourceUrlChange,
  unrecognized = false,
  savedPlaceIds,
  savingPlaceId = null,
  saveError = null,
  onSelectPlace,
  onOpenPlace,
  onBack,
}: SearchPlaceViewProps) {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const {
    query,
    setQuery,
    isSearchable,
    places,
    suggestions,
    isLoading,
    hasReportedCurrentQuery,
    submitMissingReport,
  } = useSearchPlaceFlow({ savedPlaceIds });

  const trimmedSourceUrl = sourceUrl.trim();
  const duplicatePlace =
    selectedPlace && savedPlaceIds.has(selectedPlace.id) ? selectedPlace : null;
  const topUnsavedPlace =
    !duplicatePlace && isSearchable
      ? (places.find((item) => !savedPlaceIds.has(item.id)) ?? null)
      : null;

  const handleSelectSuggestion = (suggestionId: string) => {
    const place = places.find((item) => item.id === suggestionId);
    if (!place) {
      return;
    }

    setSelectedPlace(place);
    if (savedPlaceIds.has(place.id)) {
      return;
    }

    onSelectPlace(place);
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="map"
          aria-label="Назад"
          onClick={onBack}
          className="h-11 min-h-11 w-11 min-w-11 shrink-0 px-0 py-0"
        >
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        </Button>
        {!unrecognized && <h2 className="m-0 font-ui text-lg font-bold text-ink">Найти место</h2>}
      </div>

      {unrecognized && (
        <TextField
          variant="link"
          label="Ссылка на ролик"
          value={sourceUrl}
          onValueChange={(nextUrl) => {
            onSourceUrlChange?.(nextUrl);
          }}
          clearable={false}
          error={
            <span className="flex flex-col gap-1">
              <b className="font-bold text-ink">Не узнали место</b>
              <span>Ролик закрыт или в нём нет адреса. Напиши название, найдём сами.</span>
            </span>
          }
        />
      )}

      {!unrecognized && trimmedSourceUrl.length > 0 && (
        <span className="truncate font-mono text-xs text-ink-muted">
          Ссылка сохранится с местом: {trimmedSourceUrl}
        </span>
      )}

      <TextField
        variant="search"
        label="Название места"
        placeholder="Например, Сосны"
        value={query}
        onValueChange={(nextValue) => {
          setSelectedPlace(null);
          setQuery(nextValue);
        }}
        loading={isLoading || savingPlaceId !== null}
        visualState="focus"
        hint={query.trim().length === 0 ? 'Подскажем со второй буквы' : undefined}
        {...(isSearchable && suggestions ? { suggestions } : {})}
        showReportMissing={isSearchable}
        onReportMissing={() => {
          void submitMissingReport(trimmedSourceUrl || null);
        }}
        onSelectSuggestion={(suggestion) => {
          handleSelectSuggestion(suggestion.id);
        }}
      />

      {duplicatePlace && <CandidateCard place={duplicatePlace} alreadySaved onOpen={onOpenPlace} />}

      {topUnsavedPlace && (
        <Button
          variant="primary"
          fullWidth
          loading={savingPlaceId === topUnsavedPlace.id}
          loadingLabel="Сохраняем"
          onClick={() => {
            onSelectPlace(topUnsavedPlace);
          }}
        >
          Да, сохранить
        </Button>
      )}

      {hasReportedCurrentQuery && (
        <p role="status" className="m-0 text-sm leading-5 text-ink-muted">
          Заявка отправлена — проверим и добавим место в базу.
        </p>
      )}

      {saveError && <span className="text-sm leading-5 text-ink-muted">{saveError}</span>}
    </section>
  );
}
