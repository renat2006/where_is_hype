import { QueryClient, QueryClientContext, QueryClientProvider } from '@tanstack/react-query';
import type { Location, Place, SavedPlace } from '@where-is-hype/core';
import { distanceM } from '@where-is-hype/core';
import clsx from 'clsx';
import { type HTMLAttributes, useContext } from 'react';

import { PlaceRow } from '@/entities/place';
import {
  formatOfflineUpdatedAt,
  OFFLINE_EXPLANATION_TEXT,
  useCachedSavedPlaces,
} from '@/features/offline-status/model/offline-status-model';
import { Logo } from '@/shared/ui/logo';
import { OfflineBanner } from '@/shared/ui/offline-banner';

import { OfflineActionButton } from './offline-action-button';

export interface OfflinePlacesViewProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  places?: readonly (Place | SavedPlace)[] | undefined;
  updatedAt?: Date | number | string | null | undefined;
  origin?: Location | null | undefined;
  now?: Date | undefined;
  headingLevel?: 1 | 2 | undefined;
  actionLabel?: string | undefined;
  secondaryActions?: readonly string[] | undefined;
  showDistance?: boolean | undefined;
  fullScreen?: boolean | undefined;
  onSelectPlace?: ((placeId: string, item: Place | SavedPlace) => void) | undefined;
  getPlaceHref?: ((placeId: string) => string | undefined) | undefined;
}

const fallbackOfflineQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 60_000,
    },
  },
});

function extractPlace(item: Place | SavedPlace): Place {
  return 'place' in item ? item.place : item;
}

function sortPlacesByOrigin(
  items: readonly (Place | SavedPlace)[],
  origin: Location | null | undefined,
): (Place | SavedPlace)[] {
  if (!origin) {
    return [...items];
  }

  return [...items].sort((a, b) => {
    const distA = distanceM(extractPlace(a).location, origin);
    const distB = distanceM(extractPlace(b).location, origin);
    return distA - distB;
  });
}

function OfflinePlacesViewContent({
  places: placesProp,
  updatedAt: updatedAtProp,
  origin,
  now,
  headingLevel = 1,
  actionLabel = 'Добавить место',
  secondaryActions,
  showDistance = false,
  fullScreen = false,
  onSelectPlace,
  getPlaceHref,
  className,
  ...rest
}: OfflinePlacesViewProps) {
  const cached = useCachedSavedPlaces({
    places: placesProp,
    updatedAt: updatedAtProp,
    offline: true,
    now,
  });

  const sortedPlaces = sortPlacesByOrigin(cached.places, origin);
  const updatedAtText =
    updatedAtProp !== undefined
      ? formatOfflineUpdatedAt(updatedAtProp, now)
      : cached.updatedAtLabel;
  const HeadingTag = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <section
      aria-label="Мои места"
      data-testid="offline-places-view"
      className={clsx(
        'mx-auto box-border flex min-h-dvh w-full max-w-[430px] flex-col bg-bg text-ink',
        fullScreen && 'fixed inset-0 z-30 overflow-y-auto',
        className,
      )}
      {...rest}
    >
      <div className="flex flex-col items-stretch gap-3 px-4 pt-4 pb-2">
        <div className="flex items-center">
          <Logo variant="compact" />
        </div>
        <OfflineBanner variant="offline" />
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2 px-4 py-3">
          <HeadingTag className="m-0 font-ui text-lg leading-7 font-bold text-ink">
            Мои места
          </HeadingTag>
          <span
            data-testid="offline-updated-at"
            className="font-mono text-xs leading-4 text-ink-muted"
          >
            {updatedAtText}
          </span>
        </div>

        <div
          role="list"
          aria-label="Мои места"
          className="flex flex-col border-t-[1.5px] border-line"
        >
          {sortedPlaces.length > 0 ? (
            sortedPlaces.map((item) => {
              const place = extractPlace(item);
              const href = getPlaceHref?.(place.id);
              const computedDistanceM =
                showDistance || origin
                  ? origin
                    ? distanceM(place.location, origin)
                    : place.metro.distanceM
                  : null;

              return (
                <div key={place.id} role="listitem">
                  <PlaceRow
                    place={item}
                    distanceM={computedDistanceM}
                    origin={origin}
                    at={now}
                    href={href}
                    onClick={
                      onSelectPlace
                        ? (event) => {
                            if (href !== undefined) {
                              event.preventDefault();
                            }
                            onSelectPlace(place.id, item);
                          }
                        : undefined
                    }
                    className="bg-transparent"
                  />
                </div>
              );
            })
          ) : (
            <p
              data-testid="offline-empty-message"
              className="m-0 border-b-[1.5px] border-line px-4 py-5 font-ui text-sm leading-5 text-ink-muted"
            >
              Сохранённых мест в кэше пока нет.
            </p>
          )}
        </div>

        <div
          data-testid="offline-explanation"
          className="m-4 flex flex-col gap-2 rounded-md border-[1.5px] border-dashed border-line p-3.5 font-ui text-sm leading-5 text-ink-muted"
        >
          {OFFLINE_EXPLANATION_TEXT}
        </div>

        <span className="flex-1" />

        <div className="flex flex-col gap-2 px-4 pb-4">
          <OfflineActionButton
            data-testid="offline-primary-action"
            label={actionLabel}
            offline
            fullWidth
          />
          {secondaryActions?.map((secLabel) => (
            <OfflineActionButton
              key={secLabel}
              variant="secondary"
              label={secLabel}
              offline
              fullWidth
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function OfflinePlacesView(props: OfflinePlacesViewProps) {
  const existingClient = useContext(QueryClientContext);

  if (!existingClient) {
    return (
      <QueryClientProvider client={fallbackOfflineQueryClient}>
        <OfflinePlacesViewContent {...props} />
      </QueryClientProvider>
    );
  }

  return <OfflinePlacesViewContent {...props} />;
}
