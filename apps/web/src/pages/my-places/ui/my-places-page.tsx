import { QueryClient, QueryClientContext, QueryClientProvider } from '@tanstack/react-query';
import type { Place, SavedPlace } from '@where-is-hype/core';
import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { countVisitedPlaces, useSeedDemoPlacesMutation } from '@/entities/saved-place';
import {
  EveningFilterEmpty,
  EveningFilterSheet,
  rememberEveningFilterSearch,
  resetEveningFilterMemory,
  useEveningFilter,
} from '@/features/evening-filter';
import { DEFAULT_METRO_STATION_ID, GeoOriginPicker, useGeoOrigin } from '@/features/geo-origin';
import {
  OfflinePlacesView,
  SlowNetworkView,
  useCachedSavedPlaces,
} from '@/features/offline-status';
import { env } from '@/shared/config';
import { track } from '@/shared/lib/analytics';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Logo } from '@/shared/ui/logo';
import { MetroStation } from '@/shared/ui/sticker';
import { PlacesMap } from '@/widgets/places-map';
import { PlacesSheet } from '@/widgets/places-sheet';

export interface MyPlacesPageProps {
  places?: readonly (Place | SavedPlace)[] | undefined;
  showDemoSeed?: boolean | undefined;
  autoRequestGeolocation?: boolean | undefined;
  now?: Date | undefined;
}

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

function countAllVisited(items: readonly (Place | SavedPlace)[]): number {
  const saved = items.filter((item): item is SavedPlace => 'visits' in item);
  return countVisitedPlaces(saved);
}

function LocateCrosshairIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx={12} cy={12} r={3} />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx={12} cy={12} r={7} />
    </svg>
  );
}

function EveningFilterSlidersIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx={16} cy={6} r={2} />
      <circle cx={10} cy={12} r={2} />
      <circle cx={18} cy={18} r={2} />
    </svg>
  );
}

function MyPlacesPageContent({
  places: placesProp,
  showDemoSeed = env.apiMocks,
  autoRequestGeolocation = true,
  now,
}: MyPlacesPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const hasTrackedOpenRef = useRef(false);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isMetroPickerOpen, setIsMetroPickerOpen] = useState(false);

  const {
    origin,
    kind,
    metroStation,
    needsMetroSelection,
    state: geoState,
    isLoading: isGeoLoading,
    selectMetro,
    requestGeolocation,
  } = useGeoOrigin({ autoRequest: autoRequestGeolocation });

  const {
    places: cachedPlaces,
    updatedAt: cachedUpdatedAt,
    isOffline,
    isLoading: isPlacesLoading,
    isSlowLoading,
  } = useCachedSavedPlaces({
    places: placesProp,
    now,
  });

  const seedDemoMutation = useSeedDemoPlacesMutation();

  useEffect(() => {
    if (hasTrackedOpenRef.current) {
      return;
    }
    hasTrackedOpenRef.current = true;
    track('map_opened');
  }, []);

  const places = placesProp ?? cachedPlaces;
  const hasPlaces = places.length > 0;
  const totalVisitedCount = countAllVisited(places);
  const showMetroPicker = needsMetroSelection || isMetroPickerOpen;

  const {
    filter,
    isOpen: isFilterOpen,
    isActive: isFilterActive,
    matchedItems,
    matchedCount,
    totalCount,
    mutedPlaceIds,
    targetDate,
    relaxations,
    openFilter,
    closeFilter,
    applyAndCloseFilter,
    updateFilter,
    resetFilter,
  } = useEveningFilter({
    items: places,
    now,
  });

  const displayedPlaces = isFilterActive ? matchedItems : places;
  const isFilterResultEmpty = hasPlaces && isFilterActive && matchedCount === 0;

  const navigateToPlace = (placeId: string) => {
    if (isFilterActive) {
      rememberEveningFilterSearch(location.search);
    } else {
      resetEveningFilterMemory();
    }
    void navigate(`/place/${placeId}`);
  };

  const handleLocateClick = async () => {
    const updated = await requestGeolocation({ force: true });
    if (updated.permissionStatus === 'denied') {
      setIsMetroPickerOpen(true);
    }
  };

  const handleMapSelectPlace = (placeId: string) => {
    if (selectedPlaceId === placeId) {
      navigateToPlace(placeId);
      return;
    }
    setSelectedPlaceId(placeId);
  };

  if (isOffline) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-bg text-ink">
        <OfflinePlacesView
          places={places}
          updatedAt={cachedUpdatedAt}
          origin={origin}
          now={now}
          fullScreen
          getPlaceHref={(placeId) => `/place/${placeId}`}
          onSelectPlace={(placeId) => {
            navigateToPlace(placeId);
          }}
        />
      </main>
    );
  }

  if (showMetroPicker) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-76px)] w-full max-w-[430px] flex-col bg-bg text-ink">
        <h1 className="sr-only">Мои места</h1>
        <GeoOriginPicker
          selectedStationId={metroStation?.id ?? geoState.metroStationId}
          loading={isGeoLoading}
          onBack={() => {
            if (!geoState.metroStationId) {
              selectMetro(DEFAULT_METRO_STATION_ID);
            }
            setIsMetroPickerOpen(false);
          }}
          onConfirm={(stationId) => {
            selectMetro(stationId);
            setIsMetroPickerOpen(false);
          }}
          onRequestGeolocation={() => {
            void requestGeolocation({ force: true }).then((next) => {
              if (next.permissionStatus === 'granted') {
                setIsMetroPickerOpen(false);
              }
            });
          }}
        />
      </main>
    );
  }

  if (isPlacesLoading) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-bg text-ink">
        <SlowNetworkView isLoading={isPlacesLoading} showSlowHint={isSlowLoading} fullScreen />
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex h-[calc(100dvh-76px)] min-h-[560px] w-full max-w-[430px] flex-col overflow-hidden bg-bg text-ink">
      {(!hasPlaces || isFilterResultEmpty) && <h1 className="sr-only">Мои места</h1>}

      {isFilterActive && !isFilterOpen && (
        <span className="sr-only" data-testid="evening-filter-active-summary">
          Показать {matchedCount} из {totalCount}
        </span>
      )}

      <div className="relative flex-1 overflow-hidden">
        <PlacesMap
          places={places}
          mutedPlaceIds={isFilterActive ? mutedPlaceIds : undefined}
          origin={origin}
          showOriginDot={hasPlaces || kind === 'geolocation' || kind === 'metro'}
          selectedPlaceId={selectedPlaceId}
          dimmed={!hasPlaces}
          paddingBottom={hasPlaces ? 360 : 320}
          onSelectPlace={handleMapSelectPlace}
          className="h-full w-full"
        />

        <div className="pointer-events-none absolute top-4 right-4 left-4 z-10 flex items-center gap-2">
          <div className="pointer-events-auto">
            <Logo variant="compact" pill />
          </div>

          <span className="flex-1" />

          {metroStation && (
            <button
              type="button"
              onClick={() => {
                setIsMetroPickerOpen(true);
              }}
              aria-label={`Станция отсчёта: ${metroStation.name}. Изменить станцию метро`}
              className="pointer-events-auto cursor-pointer rounded-pill bg-transparent p-0 focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink"
            >
              <MetroStation variant="origin" name={metroStation.name} />
            </button>
          )}

          <div className="pointer-events-auto">
            <Button
              variant="map"
              aria-label="Где я"
              loading={isGeoLoading}
              onClick={() => {
                void handleLocateClick();
              }}
              className="h-12 w-12 px-0 py-0"
            >
              <LocateCrosshairIcon />
            </Button>
          </div>
        </div>

        <div className="pointer-events-none absolute top-[72px] left-4 z-10">
          <div className="pointer-events-auto">
            {isFilterActive ? (
              <Chip
                selected
                icon={<EveningFilterSlidersIcon />}
                data-testid="evening-filter-trigger"
                onClick={openFilter}
              >
                Фильтр · {matchedCount}
              </Chip>
            ) : (
              <Button
                variant="map"
                data-testid="evening-filter-trigger"
                onClick={openFilter}
                className="min-h-11 px-3.5 py-2 text-sm font-semibold"
              >
                <EveningFilterSlidersIcon />
                <span>На вечер</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {hasPlaces ? (
        isFilterResultEmpty ? (
          <EveningFilterEmpty
            filter={filter}
            relaxations={relaxations}
            onSelectRelaxation={(relaxation) => {
              updateFilter(relaxation.filter, { keepOpen: false });
            }}
            onReset={() => {
              resetFilter({ keepOpen: false });
            }}
          />
        ) : (
          <PlacesSheet
            places={displayedPlaces}
            origin={origin}
            selectedPlaceId={selectedPlaceId}
            visitedCount={totalVisitedCount}
            totalCount={places.length}
            at={isFilterActive ? targetDate : now}
            headingLevel={1}
            defaultSnap="half"
            getPlaceHref={(placeId) => `/place/${placeId}`}
            onSelectPlace={(placeId) => {
              setSelectedPlaceId(placeId);
              navigateToPlace(placeId);
            }}
            footer={
              showDemoSeed && places.length < 8 && !isFilterActive ? (
                <div className="flex justify-center border-t-[1.5px] border-line py-2">
                  <Button
                    variant="text"
                    loading={seedDemoMutation.isPending}
                    onClick={() => {
                      seedDemoMutation.mutate();
                    }}
                  >
                    Демо: добавить 8 мест
                  </Button>
                </div>
              ) : undefined
            }
          />
        )
      ) : (
        <section
          aria-label="Список мест пуст"
          data-testid="my-places-empty-sheet"
          className="absolute right-0 bottom-0 left-0 z-10 box-border flex min-h-[300px] flex-col gap-2.5 rounded-t-lg border-t-[1.5px] border-ink bg-surface px-6 py-7 text-ink"
        >
          <h2 className="m-0 font-display text-[26px] leading-[1.1] font-normal text-ink">
            Пока пусто
          </h2>
          <p className="m-0 font-ui text-base leading-6 text-ink">
            Кинь ссылку на ролик, и место появится здесь.
          </p>

          <div className="mt-auto flex flex-col items-center gap-2 pt-4">
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                void navigate('/add');
              }}
            >
              Кинь ссылку
            </Button>

            {showDemoSeed && (
              <Button
                variant="text"
                loading={seedDemoMutation.isPending}
                onClick={() => {
                  seedDemoMutation.mutate();
                }}
              >
                Демо: добавить 8 мест
              </Button>
            )}
          </div>
        </section>
      )}

      {isFilterOpen && (
        <EveningFilterSheet
          filter={filter}
          matchedCount={matchedCount}
          totalCount={totalCount}
          now={now}
          onUpdate={(patch) => {
            updateFilter(patch, { keepOpen: true });
          }}
          onReset={() => {
            resetFilter({ keepOpen: true });
          }}
          onApply={applyAndCloseFilter}
          onClose={closeFilter}
        />
      )}
    </main>
  );
}

export function MyPlacesPage(props: MyPlacesPageProps) {
  const existingQueryClient = useContext(QueryClientContext);

  if (!existingQueryClient) {
    return (
      <QueryClientProvider client={fallbackQueryClient}>
        <MyPlacesPageContent {...props} />
      </QueryClientProvider>
    );
  }

  return <MyPlacesPageContent {...props} />;
}
