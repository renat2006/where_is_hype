import { QueryClient, QueryClientContext, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Shortlist, Vote } from '@where-is-hype/core';
import clsx from 'clsx';
import { ChevronLeft, Share } from 'lucide-react';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  canShareShortlist,
  getShortlistLeader,
  shareMyShortlist,
  SHORTLIST_MAX_PLACES,
  SHORTLIST_MIN_SHARE_PLACES,
  SHORTLIST_TTL_DAYS,
  shortlistQueries,
  VoteCount,
  VotersAvatars,
} from '@/entities/shortlist';
import { track } from '@/shared/lib/analytics';
import { Button } from '@/shared/ui/button';
import { Sticker } from '@/shared/ui/sticker';
import { showToast, ToastViewport } from '@/shared/ui/toast';

const SHARE_COPIED_TOAST_MESSAGE = 'Ссылка скопирована';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});

function countActiveVoters(votes: readonly Vote[]): number {
  const latestByVoter = new Map<string, Vote>();
  for (const vote of votes) {
    latestByVoter.set(vote.voterId, vote);
  }

  let active = 0;
  for (const vote of latestByVoter.values()) {
    if (vote.placeIds.length > 0) {
      active += 1;
    }
  }
  return active;
}

function pluralizePlacesWord(count: number): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 19) {
    return 'мест';
  }
  if (mod10 === 1) {
    return 'место';
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return 'места';
  }
  return 'мест';
}

function pluralizeFriendsWord(count: number): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 19) {
    return 'друзей';
  }
  if (mod10 === 1) {
    return 'друг';
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return 'друга';
  }
  return 'друзей';
}

function pluralizeAnsweredVerb(count: number): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 !== 11 && mod10 === 1) {
    return 'Ответил';
  }
  return 'Ответили';
}

async function copyShortlistUrlToClipboard(url: string): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false;
  }

  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

function buildShortlistShareUrl(token: string, origin?: string): string {
  const baseOrigin =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4700');
  return `${baseOrigin.replace(/\/+$/, '')}/s/${encodeURIComponent(token)}`;
}

export interface EveningPageProps {
  shortlist?: Shortlist | undefined;
}

export function EveningPage({ shortlist: shortlistProp }: EveningPageProps = {}) {
  const navigate = useNavigate();
  const contextQueryClient = useContext(QueryClientContext);
  const activeQueryClient = contextQueryClient ?? fallbackQueryClient;
  const queryClient = useQueryClient(activeQueryClient);
  const [isSharing, setIsSharing] = useState(false);

  const { data: shortlistData, refetch: refetchShortlistQuery } = useQuery(
    {
      ...shortlistQueries.mine(),
      enabled: shortlistProp === undefined,
      refetchOnWindowFocus: 'always',
    },
    activeQueryClient,
  );

  const refetchShortlist = useCallback(() => {
    if (shortlistProp !== undefined) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: shortlistQueries.all() });
    void refetchShortlistQuery();
  }, [queryClient, refetchShortlistQuery, shortlistProp]);

  useEffect(() => {
    if (typeof window === 'undefined' || shortlistProp !== undefined) {
      return;
    }

    const handleFocus = () => {
      refetchShortlist();
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        refetchShortlist();
      }
    };

    const handleStorage = () => {
      refetchShortlist();
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
  }, [refetchShortlist, shortlistProp]);

  const shortlist = shortlistProp ?? shortlistData;
  const places = shortlist?.places ?? [];
  const votes = shortlist?.votes ?? [];
  const token = shortlist?.token ?? 'evening-demo';
  const friendPath = `/s/${encodeURIComponent(token)}`;

  const canShare = canShareShortlist(shortlist);
  const isAtMaxLimit = places.length >= SHORTLIST_MAX_PLACES;
  const activeVotersCount = countActiveVoters(votes);
  const leader = shortlist ? getShortlistLeader(shortlist) : null;

  const handleBack = () => {
    const historyState: unknown = typeof window !== 'undefined' ? window.history.state : null;
    const historyIdx =
      typeof historyState === 'object' &&
      historyState !== null &&
      'idx' in historyState &&
      typeof (historyState as { idx?: unknown }).idx === 'number'
        ? (historyState as { idx: number }).idx
        : 0;

    if (historyIdx > 0) {
      void navigate(-1);
      return;
    }

    void navigate('/');
  };

  const handleShare = async () => {
    if (!canShare || isSharing) {
      return;
    }

    setIsSharing(true);
    try {
      const shared = shortlistProp ?? (await shareMyShortlist());
      if (!shortlistProp) {
        queryClient.setQueryData(shortlistQueries.mine().queryKey, shared);
        await queryClient.invalidateQueries({ queryKey: shortlistQueries.all() });
      }

      const shareUrl = buildShortlistShareUrl(shared.token);
      track('shortlist_shared', {
        token: shared.token,
        placesCount: shared.places.length,
      });

      const hasWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

      if (hasWebShare) {
        try {
          await navigator.share({
            title: 'Куда в пятницу? · Где Хайп?',
            text: shared.places.map((p) => p.name).join(', '),
            url: shareUrl,
          });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          // Fall back to clipboard copy and toast when Web Share fails
        }
      }

      await copyShortlistUrlToClipboard(shareUrl);
      showToast({ message: SHARE_COPIED_TOAST_MESSAGE });
    } finally {
      setIsSharing(false);
    }
  };

  const handleOpenAsFriend = () => {
    if (!canShare) {
      return;
    }

    if (!shortlistProp) {
      void shareMyShortlist()
        .then((shared) => {
          queryClient.setQueryData(shortlistQueries.mine().queryKey, shared);
        })
        .catch(() => undefined);
    }

    if (typeof window !== 'undefined') {
      window.open(friendPath, '_blank', 'noopener,noreferrer');
    }
  };

  const handleAddPlace = () => {
    if (isAtMaxLimit) {
      return;
    }
    void navigate('/');
  };

  return (
    <main
      data-testid="evening-page"
      className="mx-auto flex min-h-[calc(100dvh-76px)] w-full max-w-[26.875rem] flex-col gap-4 p-4 text-ink"
    >
      <header className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Назад"
          onClick={handleBack}
          className="box-border inline-flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 cursor-pointer items-center justify-center rounded-pill border-[1.5px] border-ink bg-glass text-ink transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink active:bg-line"
        >
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <section aria-label="Заголовок подборки" className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-[1.875rem] leading-[1.05] font-normal text-ink">
          На вечер
        </h1>

        <p
          data-testid="evening-subtitle"
          className="m-0 font-ui text-[0.9375rem] leading-5 text-ink-muted"
        >
          {isAtMaxLimit && activeVotersCount > 0 ? (
            <>
              <span className="font-mono text-xs">{places.length}</span> из{' '}
              <span className="font-mono text-xs">{SHORTLIST_MAX_PLACES}</span> · ответили{' '}
              <span className="font-mono text-xs">{activeVotersCount}</span> · ссылка живёт{' '}
              <span className="font-mono text-xs">{SHORTLIST_TTL_DAYS}</span> дней
            </>
          ) : activeVotersCount > 0 ? (
            <>
              {pluralizeAnsweredVerb(activeVotersCount)}{' '}
              <span className="font-mono text-[0.8125rem]">{activeVotersCount}</span>{' '}
              {pluralizeFriendsWord(activeVotersCount)} · ссылка живёт{' '}
              <span className="font-mono text-[0.8125rem]">{SHORTLIST_TTL_DAYS}</span> дней
            </>
          ) : (
            <>
              <span className="font-mono text-[0.8125rem]">{places.length}</span>{' '}
              {pluralizePlacesWord(places.length)} · можно от{' '}
              <span className="font-mono text-[0.8125rem]">{SHORTLIST_MIN_SHARE_PLACES}</span> до{' '}
              <span className="font-mono text-[0.8125rem]">{SHORTLIST_MAX_PLACES}</span> · ссылка
              живёт <span className="font-mono text-[0.8125rem]">{SHORTLIST_TTL_DAYS}</span> дней
            </>
          )}
        </p>
      </section>

      {places.length === 0 ? (
        <section
          aria-label="Список мест на вечер пуст"
          data-testid="evening-empty"
          className="flex flex-col gap-2 rounded-md border-[1.5px] border-line bg-surface p-5 text-ink"
        >
          <p className="m-0 font-ui text-base leading-6 font-semibold text-ink">
            В подборке пока нет мест
          </p>
          <p className="m-0 font-ui text-sm leading-5 text-ink-muted">
            Выбери от <span className="font-mono text-xs">{SHORTLIST_MIN_SHARE_PLACES}</span> до{' '}
            <span className="font-mono text-xs">{SHORTLIST_MAX_PLACES}</span> мест на карте или в
            карточке, чтобы отправить ссылку другу.
          </p>
        </section>
      ) : (
        <section
          aria-label="Места в подборке"
          data-testid="evening-places-list"
          className="overflow-hidden rounded-md border-[1.5px] border-ink bg-surface"
        >
          <ul className="m-0 list-none p-0">
            {places.map((place, index) => (
              <li
                key={place.id}
                data-testid={`evening-place-row-${place.id}`}
                className={clsx(index > 0 && 'border-t-[1.5px] border-line')}
              >
                <Link
                  to={`/place/${place.id}`}
                  className="box-border flex min-h-[3.5rem] w-full items-center gap-2.5 px-3 py-2.5 text-ink no-underline transition-colors duration-150 ease-out hover:bg-line/40 focus-visible:outline-[2.5px] focus-visible:-outline-offset-2 focus-visible:outline-ink active:bg-line"
                >
                  <Sticker
                    type={place.type}
                    size="sm"
                    placeId={place.id}
                    name={place.name}
                    tilt={false}
                  />

                  <div className="min-w-0 flex-1">
                    <b
                      data-testid={`evening-place-name-${place.id}`}
                      className="block truncate font-ui text-base leading-[1.375rem] font-semibold text-ink"
                    >
                      {place.name}
                    </b>
                    <div className="truncate font-ui text-[0.8125rem] leading-[1.125rem] text-ink-muted">
                      {place.metro.name}
                    </div>
                  </div>

                  <VotersAvatars
                    votes={votes}
                    placeId={place.id}
                    maxVisible={3}
                    size="sm"
                    className="shrink-0"
                  />

                  <VoteCount
                    votes={votes}
                    placeId={place.id}
                    variant="badge"
                    data-testid={`evening-place-votes-${place.id}`}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {leader ? (
        <p data-testid="shortlist-leader" className="m-0 font-ui text-sm leading-5 text-ink">
          Лидирует <strong className="font-semibold">{leader.place.name}</strong> —{' '}
          <span className="font-mono text-[0.8125rem]">{leader.votes}</span> из{' '}
          <span className="font-mono text-[0.8125rem]">{activeVotersCount}</span>.
        </p>
      ) : places.length > 0 ? (
        <p className="m-0 font-ui text-sm leading-5 text-ink-muted">
          Друзьям не нужно ставить приложение — откроется страница, где можно отметить «Мне
          подходит».
        </p>
      ) : null}

      {places.length === 1 && (
        <p
          data-testid="shortlist-min-hint"
          className="m-0 font-ui text-[0.8125rem] leading-[1.125rem] text-ink-muted"
        >
          Добавь ещё хотя бы <span className="font-mono text-xs">1</span> место — кнопка «Отправить»
          активна с <span className="font-mono text-xs">{SHORTLIST_MIN_SHARE_PLACES}</span>.
        </p>
      )}

      {isAtMaxLimit && (
        <p
          data-testid="shortlist-max-hint"
          className="m-0 font-ui text-[0.8125rem] leading-[1.125rem] text-ink-muted"
        >
          Больше <span className="font-mono text-xs">{SHORTLIST_MAX_PLACES}</span> нельзя: «В „На
          вечер“» на карточке становится неактивной с подписью «Уже{' '}
          <span className="font-mono text-xs">{SHORTLIST_MAX_PLACES}</span> мест».
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button
          variant="primary"
          fullWidth
          disabled={!canShare}
          loading={isSharing}
          onClick={() => {
            void handleShare();
          }}
          data-testid="evening-share-button"
        >
          <Share size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          <span>Отправить</span>
        </Button>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="text"
            disabled={!canShare}
            onClick={handleOpenAsFriend}
            data-testid="evening-open-as-friend"
            data-href={friendPath}
          >
            Открыть как друг
          </Button>

          <Button
            variant="text"
            disabled={isAtMaxLimit}
            onClick={handleAddPlace}
            data-testid="evening-add-place"
          >
            Добавить место
          </Button>
        </div>
      </div>

      <ToastViewport className="mb-[4.75rem]" />
    </main>
  );
}
