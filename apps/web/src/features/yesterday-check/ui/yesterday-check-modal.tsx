import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import type { SavedPlace, Shortlist } from '@where-is-hype/core';
import { Check } from 'lucide-react';
import { useContext, useId, useMemo, useState } from 'react';

import { savedPlaceQueries } from '@/entities/saved-place';
import {
  dismissYesterdayCheck,
  getShortlistCheckKey,
  markShortlistPlaceVisit,
  resolveShortlistPlaces,
  type ShortlistPlaceEntry,
  shouldShowYesterdayCheck,
} from '@/features/yesterday-check/model/yesterday-check-model';
import { demoSeedPlacesFixture, readMockState } from '@/shared/api';
import { track } from '@/shared/lib/analytics';
import { Button } from '@/shared/ui/button';
import { Logo } from '@/shared/ui/logo';
import { Sticker } from '@/shared/ui/sticker';
import { showToast } from '@/shared/ui/toast';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const DEMO_PREVIEW_SHORTLIST: Shortlist = {
  token: 'demo-yesterday',
  places: demoSeedPlacesFixture.slice(2, 5).map((item) => item.place),
  createdAt: '2026-10-26T15:00:00.000Z',
  expiresAt: '2099-10-27T15:00:00.000Z',
  votes: [],
};

function isYesterdayPreviewUrl(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('yesterdayCheck') === '1';
}

export interface YesterdayCheckModalProps {
  now?: Date | undefined;
  shortlist?: Shortlist | null | undefined;
  forceOpen?: boolean | undefined;
  onClose?: (() => void) | undefined;
  onPlaceMarked?: ((savedPlace: SavedPlace) => void) | undefined;
}

export function YesterdayCheckModal({
  now,
  shortlist: shortlistProp,
  forceOpen,
  onClose,
  onPlaceMarked,
}: YesterdayCheckModalProps) {
  const titleId = useId();
  const contextQueryClient = useContext(QueryClientContext);
  const activeQueryClient = contextQueryClient ?? fallbackQueryClient;
  const savedPlacesQuery = useQuery(
    {
      ...savedPlaceQueries.list(),
      enabled: Boolean(contextQueryClient),
    },
    activeQueryClient,
  );

  const [dismissed, setDismissed] = useState(false);
  const [markedIds, setMarkedIds] = useState<string[]>([]);

  const previewForced = forceOpen === true || isYesterdayPreviewUrl();

  const resolvedShortlist = useMemo<Shortlist | null>(() => {
    if (shortlistProp) {
      return shortlistProp;
    }
    const stateShortlist = readMockState().shortlist;
    if (stateShortlist && stateShortlist.places.length > 0) {
      return stateShortlist;
    }
    if (previewForced) {
      return DEMO_PREVIEW_SHORTLIST;
    }
    return stateShortlist;
  }, [previewForced, shortlistProp]);

  const shouldOpen = useMemo(() => {
    if (dismissed) {
      return false;
    }
    if (forceOpen !== undefined) {
      return forceOpen;
    }
    if (isYesterdayPreviewUrl()) {
      return true;
    }
    return shouldShowYesterdayCheck({
      shortlist: resolvedShortlist,
      savedPlaces: savedPlacesQuery.data,
      now,
    });
  }, [dismissed, forceOpen, now, resolvedShortlist, savedPlacesQuery.data]);

  const entries = useMemo<ShortlistPlaceEntry[]>(() => {
    if (!resolvedShortlist || !shouldOpen) {
      return [];
    }
    return resolveShortlistPlaces(resolvedShortlist.places, savedPlacesQuery.data);
  }, [resolvedShortlist, savedPlacesQuery.data, shouldOpen]);

  if (!shouldOpen || !resolvedShortlist || entries.length === 0) {
    return null;
  }

  const shortlistKey = getShortlistCheckKey(resolvedShortlist);

  const handleMarkPlace = async (entry: ShortlistPlaceEntry) => {
    const placeId = entry.place.id;
    if (markedIds.includes(placeId)) {
      return;
    }

    setMarkedIds((prev) => [...prev, placeId]);

    track('visit_marked', {
      placeId,
      verified: false,
      status: 'not',
    });

    try {
      const updated = await markShortlistPlaceVisit({
        place: entry.place,
        savedPlace: entry.savedPlace,
      });

      activeQueryClient.setQueryData<SavedPlace[]>(savedPlaceQueries.list().queryKey, (prev) => {
        const list = prev ? [...prev] : [];
        const idx = list.findIndex((item) => item.place.id === updated.place.id);
        if (idx >= 0) {
          list[idx] = updated;
          return list;
        }
        return [updated, ...list];
      });

      onPlaceMarked?.(updated);
    } catch {
      // Keep marked state in UI if request fails
    }
  };

  const closeAndDismiss = (toastMessage?: string) => {
    dismissYesterdayCheck(shortlistKey);
    setDismissed(true);
    if (toastMessage) {
      showToast({ message: toastMessage });
    }
    onClose?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="yesterday-check-modal"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg text-ink"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[26.875rem] flex-col gap-4 p-4">
        <header className="flex items-center justify-between pt-1">
          <Logo variant="compact" />
        </header>

        <div className="flex flex-col gap-2 pt-2">
          <span className="inline-block -rotate-2 self-start font-hand text-lg leading-5 text-ink-muted">
            ну как оно?
          </span>

          <h2
            id={titleId}
            data-testid="yesterday-check-title"
            className="m-0 font-display text-[1.625rem] leading-[1.1] font-normal text-ink"
          >
            Сходили вчера?
          </h2>

          <p
            data-testid="yesterday-check-subtitle"
            className="m-0 font-ui text-base leading-6 text-ink-muted"
          >
            Вы выбирали из <span className="font-mono text-xs">{entries.length}</span> мест. Отметь,
            куда дошли — зачеркнём на карте.
          </p>
        </div>

        <div role="list" className="flex flex-col gap-2.5 pt-1">
          {entries.map((entry) => {
            const isMarked = markedIds.includes(entry.place.id);

            return (
              <div key={entry.place.id} role="listitem">
                <button
                  type="button"
                  aria-pressed={isMarked}
                  data-testid={`yesterday-check-place-${entry.place.id}`}
                  data-marked={isMarked ? 'true' : 'false'}
                  onClick={() => {
                    void handleMarkPlace(entry);
                  }}
                  className="box-border flex w-full cursor-pointer items-center gap-3 rounded-lg border-[1.5px] border-ink bg-surface p-3.5 text-left text-ink transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[2px] focus-visible:outline-ink"
                >
                  <Sticker
                    type={entry.place.type}
                    state={isMarked ? 'visited' : 'default'}
                    size="sm"
                    placeId={entry.place.id}
                    name={entry.place.name}
                  />

                  <span className="min-w-0 flex-1 truncate font-ui text-base leading-5 font-bold text-ink">
                    {entry.place.name}
                  </span>

                  <span
                    className={[
                      'box-border inline-flex min-h-[1.625rem] shrink-0 items-center gap-1 rounded-pill border-[1.5px] border-ink px-2.5 py-1 font-ui text-xs leading-none font-medium',
                      isMarked ? 'bg-status-open text-st-ink' : 'bg-surface-alt text-ink',
                    ].join(' ')}
                  >
                    {isMarked && <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
                    <span>Были тут</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-3">
          {markedIds.length > 0 && (
            <Button
              variant="primary"
              fullWidth
              data-testid="yesterday-check-done"
              onClick={() => {
                closeAndDismiss('Записали. Спасибо!');
              }}
            >
              Готово
            </Button>
          )}

          <Button
            variant="secondary"
            fullWidth
            data-testid="yesterday-check-did-not-go"
            onClick={() => {
              closeAndDismiss();
            }}
          >
            Не дошли
          </Button>

          <Button
            variant="text"
            data-testid="yesterday-check-dismiss"
            onClick={() => {
              closeAndDismiss();
            }}
            className="self-center text-sm text-ink-muted"
          >
            Не спрашивать про этот вечер
          </Button>
        </div>
      </div>
    </div>
  );
}
