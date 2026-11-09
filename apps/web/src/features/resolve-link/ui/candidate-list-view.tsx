import type { Candidate, Place } from '@where-is-hype/core';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';

import { CandidateCard, type ResolvedCandidate, resolveMatchStatus } from '@/entities/place';
import { Button } from '@/shared/ui/button';

import { formatShortUrl, MAX_CANDIDATES, pluralizeCandidatesNoun } from './resolve-link-flow';

export interface CandidateListViewProps {
  sourceUrl: string;
  candidates: readonly (ResolvedCandidate | Candidate)[];
  savedPlaceIds: ReadonlySet<string>;
  savingPlaceId?: string | null | undefined;
  saveError?: string | null | undefined;
  onSavePlace: (place: Place) => void;
  onOpenPlace: (place: Place) => void;
  onSearchByName: (initialQuery?: string) => void;
  onBack: () => void;
}

export function CandidateListView({
  sourceUrl,
  candidates,
  savedPlaceIds,
  savingPlaceId = null,
  saveError = null,
  onSavePlace,
  onOpenPlace,
  onSearchByName,
  onBack,
}: CandidateListViewProps) {
  const visibleCandidates = candidates.slice(0, MAX_CANDIDATES);
  const allNotFound =
    visibleCandidates.length > 0 &&
    visibleCandidates.every((item) => !item.place && resolveMatchStatus(item) === 'not_found');
  const firstUnsavedIndex = visibleCandidates.findIndex((item) => {
    const placeId = item.place?.id ?? null;
    if (placeId !== null && savedPlaceIds.has(placeId)) {
      return false;
    }
    return item.place !== null || resolveMatchStatus(item) === 'chain_ambiguous';
  });
  const shortUrl = formatShortUrl(sourceUrl);
  const selectablePlaces = visibleCandidates
    .map((c) => c.place)
    .filter((p): p is Place => p !== null && !savedPlaceIds.has(p.id));
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    selectablePlaces.map((p) => p.id),
  );
  const toggleSelectedId = (placeId: string) => {
    setSelectedIds((prev: string[]) =>
      prev.includes(placeId) ? prev.filter((id: string) => id !== placeId) : [...prev, placeId],
    );
  };
  const selectedPlaces = selectablePlaces.filter((p) => selectedIds.includes(p.id));

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
        {shortUrl && (
          <span className="min-w-0 truncate font-mono text-xs text-ink-muted">{shortUrl}</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-display text-[26px] leading-[1.1] font-normal text-ink">
          {allNotFound ? 'Не нашли в базе' : 'Это оно?'}
        </h2>
        <span className="text-[15px] leading-5 text-ink-muted">
          {allNotFound ? (
            'Распознали упоминание в ролике, но такого места пока нет в каталоге'
          ) : (
            <>
              Нашли <span className="font-mono text-[13px]">{visibleCandidates.length}</span>{' '}
              {pluralizeCandidatesNoun(visibleCandidates.length)} из ролика
            </>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {visibleCandidates.map((item, idx) => {
          const itemPlaceId = item.place?.id ?? null;
          const isSaved = itemPlaceId !== null && savedPlaceIds.has(itemPlaceId);
          const isPrimary = !isSaved && idx === firstUnsavedIndex;
          const branchSaving =
            savingPlaceId !== null &&
            'branchCandidates' in item &&
            Array.isArray(item.branchCandidates) &&
            item.branchCandidates.some((branch) => branch.id === savingPlaceId);
          const isLoading =
            (savingPlaceId !== null && itemPlaceId === savingPlaceId) || branchSaving;
          const cardKey =
            itemPlaceId ??
            `candidate-${String(idx)}-${
              'extractedName' in item && item.extractedName ? item.extractedName : 'item'
            }`;

          return (
            <CandidateCard
              key={cardKey}
              candidate={item}
              alreadySaved={isSaved}
              isPrimary={isPrimary}
              index={isPrimary ? idx + 1 : undefined}
              total={isPrimary ? visibleCandidates.length : undefined}
              sourceUrl={sourceUrl}
              loading={isLoading}
              onSave={onSavePlace}
              onOpen={onOpenPlace}
              onSearchByName={onSearchByName}
            />
          );
        })}
      </div>

      {selectablePlaces.length >= 2 && (
        <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-line bg-surface p-3">
          <div className="flex flex-wrap gap-2">
            {selectablePlaces.map((p) => {
              const checked = selectedIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="inline-flex cursor-pointer items-center gap-1.5 font-ui text-xs text-ink"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      toggleSelectedId(p.id);
                    }}
                    data-testid={`select-candidate-${p.id}`}
                  />
                  <span>{p.name}</span>
                </label>
              );
            })}
          </div>
          <Button
            variant="secondary"
            disabled={selectedPlaces.length === 0}
            data-testid="save-selected-candidates"
            onClick={() => {
              for (const place of selectedPlaces) {
                onSavePlace(place);
              }
            }}
          >
            Сохранить выбранные ({selectedPlaces.length})
          </Button>
        </div>
      )}

      {saveError && <span className="text-sm leading-5 text-ink-muted">{saveError}</span>}

      {!allNotFound && (
        <Button
          variant="text"
          onClick={() => {
            onSearchByName();
          }}
          className="self-center"
        >
          Не то. Найти по названию
        </Button>
      )}
    </section>
  );
}
