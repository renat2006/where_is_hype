import type { Candidate, Place } from '@where-is-hype/core';
import { ChevronLeft } from 'lucide-react';

import { CandidateCard } from '@/entities/place';
import { Button } from '@/shared/ui/button';

import { formatShortUrl, MAX_CANDIDATES, pluralizeCandidatesNoun } from './resolve-link-flow';

export interface CandidateListViewProps {
  sourceUrl: string;
  candidates: readonly Candidate[];
  savedPlaceIds: ReadonlySet<string>;
  savingPlaceId?: string | null | undefined;
  saveError?: string | null | undefined;
  onSavePlace: (place: Place) => void;
  onOpenPlace: (place: Place) => void;
  onSearchByName: () => void;
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
  const firstUnsavedIndex = visibleCandidates.findIndex(
    (item) => !savedPlaceIds.has(item.place.id),
  );
  const shortUrl = formatShortUrl(sourceUrl);

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
          Это оно?
        </h2>
        <span className="text-[15px] leading-5 text-ink-muted">
          Нашли <span className="font-mono text-[13px]">{visibleCandidates.length}</span>{' '}
          {pluralizeCandidatesNoun(visibleCandidates.length)} из ролика
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {visibleCandidates.map((item, idx) => {
          const isSaved = savedPlaceIds.has(item.place.id);
          const isPrimary = !isSaved && idx === firstUnsavedIndex;
          const isLoading = savingPlaceId === item.place.id;

          return (
            <CandidateCard
              key={item.place.id}
              candidate={item}
              alreadySaved={isSaved}
              isPrimary={isPrimary}
              index={isPrimary ? idx + 1 : undefined}
              total={isPrimary ? visibleCandidates.length : undefined}
              loading={isLoading}
              onSave={onSavePlace}
              onOpen={onOpenPlace}
            />
          );
        })}
      </div>

      {saveError && <span className="text-sm leading-5 text-ink-muted">{saveError}</span>}

      <Button variant="text" onClick={onSearchByName} className="self-center">
        Не то. Найти по названию
      </Button>
    </section>
  );
}
