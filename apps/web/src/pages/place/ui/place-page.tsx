import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import type { Location } from '@where-is-hype/core';
import { distanceM, formatDistance } from '@where-is-hype/core';
import clsx from 'clsx';
import { ChevronLeft, Navigation } from 'lucide-react';
import { type ReactNode, useContext, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

import { HoursStatus, placeQueries, PlaceTypeLabel, PriceLabel } from '@/entities/place';
import { isPlaceVisited, savedPlaceQueries, SourceVideo } from '@/entities/saved-place';
import { DeletePlaceButton } from '@/features/delete-place';
import { EditNote } from '@/features/edit-note';
import { MarkVisitButton } from '@/features/mark-visit';
import { ShortlistToggleButton } from '@/features/shortlist-toggle';
import { track } from '@/shared/lib/analytics';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { MetroBadge, Sticker } from '@/shared/ui/sticker';

import {
  buildYandexMapsReviewsUrl,
  buildYandexMapsRouteLinks,
  getPlaceViewTransitionName,
  isLongPlaceTitle,
  openYandexMapsRoute,
  resolveSavedPlaceForCard,
  runWithViewTransition,
} from './place-links';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});

export interface PlacePageProps {
  placeId?: string | undefined;
  origin?: Location | null | undefined;
  at?: Date | undefined;
  hereSlot?: ReactNode | undefined;
  visitSlot?: ReactNode | undefined;
  eveningSlot?: ReactNode | undefined;
  shortlistSlot?: ReactNode | undefined;
}

export function PlacePage({
  placeId: placeIdProp,
  origin,
  at,
  hereSlot,
  visitSlot,
  eveningSlot,
  shortlistSlot,
}: PlacePageProps = {}) {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const contextQueryClient = useContext(QueryClientContext);
  const activeQueryClient = contextQueryClient ?? fallbackQueryClient;

  const resolvedId = (placeIdProp ?? params.id ?? 'sosny').trim();

  const savedPlacesQuery = useQuery(savedPlaceQueries.list(), activeQueryClient);
  const catalogQuery = useQuery(placeQueries.list(), activeQueryClient);

  const savedPlace = resolveSavedPlaceForCard(resolvedId, savedPlacesQuery.data, catalogQuery.data);

  const place = savedPlace?.place ?? null;
  const trackedPlaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!place) {
      return;
    }
    if (trackedPlaceIdRef.current === place.id) {
      return;
    }
    trackedPlaceIdRef.current = place.id;
    track('card_opened', { placeId: place.id, type: place.type });
  }, [place]);

  const handleBack = () => {
    runWithViewTransition(() => {
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

      void navigate({
        pathname: '/',
        search: routerLocation.search,
      });
    });
  };

  if (!place || !savedPlace) {
    return (
      <main className="mx-auto flex w-full max-w-[26.875rem] flex-col gap-4 p-4">
        <h1 className="sr-only">Карточка места</h1>
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
        <EmptyState
          title="Место не найдено"
          description="Возможно, оно было удалено из твоей карты."
          actionLabel="К моим местам"
          onAction={handleBack}
        />
      </main>
    );
  }

  const isVisited = isPlaceVisited(savedPlace);
  const distanceMeters = origin ? distanceM(place.location, origin) : place.metro.distanceM;
  const formattedDistance = formatDistance(distanceMeters);
  const isCompactTitle = isLongPlaceTitle(place.name);
  const routeLinks = buildYandexMapsRouteLinks(place.location, origin);
  const reviewsUrl = buildYandexMapsReviewsUrl(place);
  const resolvedVisitSlot =
    hereSlot !== undefined ? (
      hereSlot
    ) : visitSlot !== undefined ? (
      visitSlot
    ) : (
      <MarkVisitButton place={place} savedPlace={savedPlace} at={at} />
    );
  const resolvedEveningSlot =
    eveningSlot !== undefined ? (
      eveningSlot
    ) : shortlistSlot !== undefined ? (
      shortlistSlot
    ) : (
      <ShortlistToggleButton placeId={place.id} />
    );

  const handleRouteClick = () => {
    track('route_clicked', { placeId: place.id, type: place.type });
    openYandexMapsRoute(place.location, origin);
  };

  const handleDeleted = () => {
    runWithViewTransition(() => {
      void navigate({
        pathname: '/',
        search: routerLocation.search,
      });
    });
  };

  return (
    <main
      data-testid="place-page"
      data-place-id={place.id}
      className="mx-auto flex w-full max-w-[26.875rem] flex-col gap-4 p-4"
    >
      <h1 className="sr-only">Карточка места</h1>

      <header className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Назад"
          onClick={handleBack}
          className="box-border inline-flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 cursor-pointer items-center justify-center rounded-pill border-[1.5px] border-ink bg-glass text-ink transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink active:bg-line"
        >
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>

        <span
          data-testid="place-distance"
          className="font-mono text-[0.75rem] leading-[1rem] text-ink-muted"
        >
          {formattedDistance} от тебя
        </span>
      </header>

      <section aria-label="О месте" className="flex flex-wrap items-start gap-3.5">
        <Sticker
          type={place.type}
          state={isVisited ? 'visited' : 'default'}
          size="lg"
          placeId={place.id}
          name={place.name}
          tilt={false}
          style={{ viewTransitionName: getPlaceViewTransitionName(place.id) }}
          data-testid="place-sticker"
        />

        <div className="flex min-w-[min(100%,11rem)] flex-1 flex-col gap-1">
          <h2
            data-testid="place-title"
            data-title-size={isCompactTitle ? 'compact' : 'default'}
            className={clsx(
              'm-0 font-display font-normal wrap-break-word text-ink',
              isCompactTitle
                ? 'text-xl text-[min(1.5rem,36px)] leading-[1.1]'
                : 'text-2xl text-[min(1.875rem,44px)] leading-[1.05]',
            )}
          >
            {place.name}
          </h2>

          <PlaceTypeLabel
            type={place.type}
            visited={isVisited}
            data-testid="place-type"
            className="text-[0.875rem] leading-[1.25rem]"
          />
        </div>
      </section>

      <section
        aria-label="Адрес и часы работы"
        className="flex flex-col gap-2 rounded-md border-[1.5px] border-line bg-surface px-3.5 py-3 text-[0.9375rem] leading-[1.375rem] text-ink"
      >
        <span data-testid="place-address" className="wrap-break-word">
          {place.address}
        </span>

        <div data-testid="place-metro" className="flex flex-wrap items-center gap-2">
          <MetroBadge variant="badge" name={place.metro.name} />
          <span className="wrap-break-word">{place.metro.name}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HoursStatus
            hours={place.hours}
            at={at}
            data-testid="place-hours-status"
            className="whitespace-normal"
          />
          <PriceLabel
            avgCheck={place.avgCheck}
            data-testid="place-price"
            className="text-[0.875rem] leading-[1.25rem]"
          />
        </div>
      </section>

      <SourceVideo savedPlace={savedPlace} showTape className="mt-0" />

      <EditNote placeId={place.id} note={savedPlace.note} />

      <section aria-label="Действия" className="flex flex-col gap-1.5">
        <Button
          variant="primary"
          fullWidth
          onClick={handleRouteClick}
          data-testid="place-route-button"
          data-scheme-url={routeLinks.schemeUrl}
          data-web-url={routeLinks.webUrl}
          className="min-h-[3rem] px-[1.25rem] py-[0.625rem] text-[1rem] whitespace-normal"
        >
          <Navigation size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          <span>Маршрут</span>
        </Button>

        <div data-slot="visit-action" data-testid="place-visit-slot" className="empty:hidden">
          {resolvedVisitSlot}
        </div>

        <div data-slot="evening-action" data-testid="place-evening-slot" className="empty:hidden">
          {resolvedEveningSlot}
        </div>

        <a
          href={reviewsUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="place-reviews-link"
          className="inline-flex min-h-[2.75rem] items-center justify-center self-center px-[0.75rem] py-[0.375rem] text-center font-ui text-[0.9375rem] leading-[1.25rem] font-semibold text-link underline underline-offset-4 transition-colors duration-150 ease-out hover:text-ink focus-visible:rounded-pill focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink"
        >
          Отзывы в Яндекс Картах ↗
        </a>

        <DeletePlaceButton
          placeId={place.id}
          onDeleted={handleDeleted}
          viewportClassName="mb-[4.75rem]"
          className="self-center"
        />
      </section>
    </main>
  );
}
