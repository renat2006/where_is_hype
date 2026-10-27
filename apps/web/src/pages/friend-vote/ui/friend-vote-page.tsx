import { QueryClient, QueryClientContext, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Shortlist } from '@where-is-hype/core';
import { placeTypeLabel } from '@where-is-hype/core';
import clsx from 'clsx';
import { lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';

import { HoursStatus, PriceLabel } from '@/entities/place';
import { shortlistQueries, VotersAvatars } from '@/entities/shortlist';
import { useFriendVote, VoteButton, VoterNameField } from '@/features/vote';
import { track } from '@/shared/lib/analytics';
import { ErrorNote } from '@/shared/ui/error-note';
import { Skeleton } from '@/shared/ui/skeleton';
import { Sticker } from '@/shared/ui/sticker';

import {
  isExpiredShortlistError,
  pluralizeAnsweredVerb,
  resolveFriendPlaceVideoUrl,
} from './friend-vote-utils';

const LazyPlacesMap = lazy(async () => {
  const mod = await import('@/widgets/places-map');
  return { default: mod.PlacesMap };
});

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});

export interface FriendVotePageProps {
  token?: string | undefined;
  shortlist?: Shortlist | undefined;
  now?: Date | undefined;
}

export function FriendVotePage({
  token: tokenProp,
  shortlist: shortlistProp,
  now,
}: FriendVotePageProps = {}) {
  const params = useParams<{ token: string }>();
  const contextQueryClient = useContext(QueryClientContext);
  const activeQueryClient = contextQueryClient ?? fallbackQueryClient;
  const queryClient = useQueryClient(activeQueryClient);

  const resolvedToken = (tokenProp ?? params.token ?? 'evening-demo').trim();
  const [selectedMapPlaceId, setSelectedMapPlaceId] = useState<string | null>(null);
  const trackedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!resolvedToken || trackedTokenRef.current === resolvedToken) {
      return;
    }
    trackedTokenRef.current = resolvedToken;
    track('friend_page_opened', { token: resolvedToken });
  }, [resolvedToken]);

  const {
    data: shortlistData,
    error: queryError,
    isLoading,
    refetch: refetchSharedShortlist,
  } = useQuery(
    {
      ...shortlistQueries.byToken(resolvedToken),
      enabled:
        shortlistProp === undefined && resolvedToken.length > 0 && resolvedToken !== 'expired',
      refetchOnWindowFocus: 'always',
      retry: false,
    },
    activeQueryClient,
  );

  const syncFromStorageOrFocus = useCallback(() => {
    if (shortlistProp !== undefined || resolvedToken === 'expired') {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: shortlistQueries.byToken(resolvedToken).queryKey,
    });
    void refetchSharedShortlist();
  }, [queryClient, refetchSharedShortlist, resolvedToken, shortlistProp]);

  useEffect(() => {
    if (typeof window === 'undefined' || shortlistProp !== undefined) {
      return;
    }

    const handleFocus = () => {
      syncFromStorageOrFocus();
    };

    const handleStorage = () => {
      syncFromStorageOrFocus();
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        syncFromStorageOrFocus();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [shortlistProp, syncFromStorageOrFocus]);

  const shortlist = shortlistProp ?? shortlistData ?? null;
  const places = shortlist?.places ?? [];

  const {
    voterName,
    votes,
    selectedPlaceIds,
    activeVotersCount,
    isExpired: isShortlistDataExpired,
    failedPlaceId,
    voteError,
    setVoterName,
    commitVoterName,
    togglePlaceVote,
  } = useFriendVote({
    token: resolvedToken,
    shortlist,
    now,
  });

  const isExpiredState =
    resolvedToken === 'expired' || isExpiredShortlistError(queryError) || isShortlistDataExpired;

  const isNotFoundState = Boolean(queryError) && !isExpiredState && !shortlist;
  const isInitialLoading = isLoading && !shortlist && !isExpiredState && !isNotFoundState;

  const handleSelectMapPlace = (placeId: string) => {
    setSelectedMapPlaceId(placeId);
    if (typeof document !== 'undefined') {
      const cardEl = document.getElementById(`friend-place-card-${placeId}`);
      cardEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  return (
    <main
      data-testid="friend-vote-page"
      className="mx-auto flex min-h-dvh w-full max-w-[26.875rem] flex-col gap-4 p-4 text-ink"
    >
      <header className="flex flex-col gap-1.5 border-b-[1.5px] border-ink pb-3">
        <span
          data-testid="friend-vote-kicker"
          className="font-ui text-[0.8125rem] leading-4 text-ink-muted"
        >
          Тебя позвали выбрать место
        </span>

        <h1 className="m-0 font-display text-[2rem] leading-[1.05] font-normal text-ink">
          Куда в пятницу?
        </h1>

        {activeVotersCount > 0 && (
          <div data-testid="friend-voters-summary" className="mt-0.5 flex items-center gap-2">
            <VotersAvatars votes={votes} maxVisible={3} size="sm" />
            <span className="font-ui text-[0.8125rem] leading-4 text-ink">
              уже {pluralizeAnsweredVerb(activeVotersCount)}{' '}
              <span className="font-mono text-xs font-semibold">{activeVotersCount}</span>
            </span>
          </div>
        )}
      </header>

      {isExpiredState && (
        <ErrorNote
          id="friend-vote-expired"
          title="Ссылка устарела"
          description="Срок действия ссылки (7 дней) истёк. Попроси друга отправить новую подборку «На вечер»."
        />
      )}

      {isNotFoundState && (
        <ErrorNote
          id="friend-vote-not-found"
          title="Подборка не найдена"
          description="Ссылка недействительна или устарела. Попроси друга отправить подборку ещё раз."
        />
      )}

      {isInitialLoading && (
        <section
          aria-label="Загрузка подборки"
          data-testid="friend-vote-loading"
          className="flex flex-col gap-3"
        >
          <Skeleton className="h-[136px] w-full rounded-md" />
          <Skeleton className="h-[108px] w-full rounded-md" />
          <Skeleton className="h-[108px] w-full rounded-md" />
        </section>
      )}

      {places.length > 0 && (
        <>
          <section
            aria-label="Карта выбранных мест"
            data-testid="friend-vote-map-section"
            className="overflow-hidden rounded-md border-[1.5px] border-line bg-map-land"
          >
            <Suspense
              fallback={
                <Skeleton
                  data-testid="friend-vote-map-skeleton"
                  className="h-[136px] w-full rounded-none"
                />
              }
            >
              <LazyPlacesMap
                places={places}
                selectedPlaceId={selectedMapPlaceId}
                showOrderBadges
                showOriginDot={false}
                showUserLocation={false}
                clusterRadiusPx={0}
                interactive={false}
                mapHeight={136}
                paddingBottom={0}
                onSelectPlace={handleSelectMapPlace}
                className="h-[136px] w-full"
              />
            </Suspense>
          </section>

          <section
            aria-label="Варианты мест"
            data-testid="friend-places-list"
            className="overflow-hidden rounded-md border-[1.5px] border-ink bg-surface"
          >
            {places.map((place, index) => {
              const videoUrl = resolveFriendPlaceVideoUrl(place.id);
              const isSelected = selectedPlaceIds.includes(place.id);

              return (
                <article
                  key={place.id}
                  id={`friend-place-card-${place.id}`}
                  data-testid={`friend-place-card-${place.id}`}
                  className={clsx(
                    'flex flex-col gap-2.5 p-3.5',
                    index > 0 && 'border-t-[1.5px] border-line',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <Sticker
                      type={place.type}
                      size="sm"
                      placeId={place.id}
                      name={place.name}
                      tilt={false}
                      badge={
                        <span className="font-mono text-xs leading-none font-semibold">
                          {index + 1}
                        </span>
                      }
                      data-testid={`friend-place-sticker-${place.id}`}
                    />

                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <b
                        data-testid={`friend-place-name-${place.id}`}
                        className="font-ui text-base leading-[1.375rem] font-semibold wrap-break-word text-ink"
                      >
                        {place.name}
                      </b>

                      <div
                        data-testid={`friend-place-meta-${place.id}`}
                        className="font-ui text-[0.8125rem] leading-[1.125rem] text-ink-muted"
                      >
                        <span>{placeTypeLabel[place.type]}</span>
                        {' · '}
                        <span data-testid={`friend-place-address-${place.id}`}>
                          {place.address}
                        </span>
                        {' · '}
                        <span data-testid={`friend-place-metro-${place.id}`}>
                          м. {place.metro.name}
                        </span>
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-[0.8125rem] leading-[1.125rem] text-ink-muted">
                        <HoursStatus
                          hours={place.hours}
                          at={now}
                          data-testid={`friend-place-hours-${place.id}`}
                        />

                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <PriceLabel
                            avgCheck={place.avgCheck}
                            data-testid={`friend-place-price-${place.id}`}
                            className="text-[0.8125rem] leading-[1.125rem]"
                          />

                          <span aria-hidden="true">·</span>

                          <a
                            href={videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`friend-place-video-${place.id}`}
                            className="inline-flex min-h-6 items-center font-ui text-[0.8125rem] leading-[1.125rem] font-semibold text-link underline underline-offset-2 hover:text-ink"
                          >
                            ролик
                          </a>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <VoteButton
                      placeId={place.id}
                      placeName={place.name}
                      votes={votes}
                      selected={isSelected}
                      disabled={isExpiredState}
                      errorText={failedPlaceId === place.id ? (voteError ?? undefined) : undefined}
                      onToggle={(id) => {
                        void togglePlaceVote(id);
                      }}
                    />

                    <VotersAvatars
                      votes={votes}
                      placeId={place.id}
                      maxVisible={3}
                      size="sm"
                      className="shrink-0"
                    />
                  </div>
                </article>
              );
            })}
          </section>

          <VoterNameField
            value={voterName}
            disabled={isExpiredState}
            onValueChange={setVoterName}
            onCommit={(val) => {
              void commitVoterName(val);
            }}
          />
        </>
      )}

      <footer className="mt-auto flex justify-center pt-1">
        <Link
          to="/welcome"
          data-testid="friend-welcome-link"
          className="inline-flex min-h-11 items-center justify-center px-2 text-center font-ui text-sm leading-5 text-ink-muted underline underline-offset-4 transition-colors duration-150 ease-out hover:text-ink focus-visible:rounded-pill focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink"
        >
          Собирай свои места в «Где Хайп?»
        </Link>
      </footer>
    </main>
  );
}
