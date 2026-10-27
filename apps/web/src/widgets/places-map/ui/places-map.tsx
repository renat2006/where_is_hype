import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import type { Location, Place, SavedPlace } from '@where-is-hype/core';
import clsx from 'clsx';
import { Map as MapLibreMap } from 'maplibre-gl';
import {
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { GARDEN_RING_CENTER } from '@/entities/place';
import { shortlistQueries } from '@/entities/shortlist';
import { useTheme } from '@/shared/lib/theme';
import { MetroStation, MyLocationDot, Sticker, StickerCluster } from '@/shared/ui/sticker';
import {
  clusterMapPlaces,
  createZinMapStyle,
  DEFAULT_MAP_VIEWPORT,
  type MapClusterNode,
  projectLocationToPoint,
} from '@/widgets/places-map/model/places-map-model';

export interface PlacesMapProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  places: readonly (Place | SavedPlace)[];
  selectedPlaceId?: string | null | undefined;
  eveningPlaceIds?: readonly string[] | ReadonlySet<string> | undefined;
  mutedPlaceIds?: readonly string[] | ReadonlySet<string> | undefined;
  origin?: Location | null | undefined;
  userLocation?: Location | null | undefined;
  originMetroName?: string | null | undefined;
  originLocation?: Location | null | undefined;
  center?: Location | undefined;
  zoom?: number | undefined;
  clusterRadiusPx?: number | undefined;
  showOrderBadges?: boolean | undefined;
  showOriginDot?: boolean | undefined;
  showUserLocation?: boolean | undefined;
  dimmed?: boolean | undefined;
  interactive?: boolean | undefined;
  mapHeight?: number | undefined;
  paddingBottom?: number | undefined;
  onSelectPlace?: ((placeId: string, item: Place | SavedPlace) => void) | undefined;
  onClusterClick?: ((cluster: MapClusterNode) => void) | undefined;
  children?: ReactNode | undefined;
}

function canSupportWebGl(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  if (typeof WebGLRenderingContext === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});

export function PlacesMap({
  places,
  selectedPlaceId,
  eveningPlaceIds,
  mutedPlaceIds,
  origin,
  userLocation,
  originMetroName,
  originLocation,
  center = GARDEN_RING_CENTER,
  zoom = 12.6,
  clusterRadiusPx = 42,
  showOrderBadges = false,
  showOriginDot,
  showUserLocation = true,
  dimmed = false,
  interactive = true,
  mapHeight = 440,
  paddingBottom = 60,
  onSelectPlace,
  onClusterClick,
  className,
  children,
  ...rest
}: PlacesMapProps) {
  const { resolvedTheme } = useTheme();
  const contextQueryClient = useContext(QueryClientContext);
  const activeQueryClient = contextQueryClient ?? fallbackQueryClient;
  const shortlistQuery = useQuery(
    {
      ...shortlistQueries.mine(),
      enabled: eveningPlaceIds === undefined && !showOrderBadges,
    },
    activeQueryClient,
  );
  const resolvedEveningPlaceIds =
    eveningPlaceIds ??
    (showOrderBadges ? undefined : shortlistQuery.data?.places.map((place) => place.id));
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_MAP_VIEWPORT.width,
    height: mapHeight,
  });

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) {
      return;
    }

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };

    updateDimensions();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateDimensions();
      });
      observer.observe(container);
      return () => {
        observer.disconnect();
      };
    }
    return undefined;
  }, [mapHeight]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || !canSupportWebGl()) {
      return;
    }

    try {
      const map = new MapLibreMap({
        container,
        style: createZinMapStyle(resolvedTheme),
        center: [center.lng, center.lat],
        zoom,
        attributionControl: false,
        interactive,
      });

      mapInstanceRef.current = map;

      return () => {
        mapInstanceRef.current = null;
        map.remove();
      };
    } catch {
      mapInstanceRef.current = null;
      return undefined;
    }
    // Initialize MapLibre instance once per container
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }
    try {
      map.setStyle(createZinMapStyle(resolvedTheme));
    } catch {
      // Ignore style updates if MapLibre is already torn down
    }
  }, [resolvedTheme]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }
    try {
      map.jumpTo({ center: [center.lng, center.lat], zoom });
    } catch {
      // Ignore camera updates when map is not ready
    }
  }, [center.lat, center.lng, zoom]);

  const viewport = {
    width: containerSize.width,
    height: containerSize.height,
    paddingLeft: 48,
    paddingRight: 48,
    paddingTop: containerSize.height < 220 ? 28 : 136,
    paddingBottom: containerSize.height < 220 ? 28 : paddingBottom,
  };

  const nodes = clusterMapPlaces(places, {
    selectedPlaceId,
    eveningPlaceIds: resolvedEveningPlaceIds,
    mutedPlaceIds,
    clusterRadiusPx,
    viewport,
  });

  const resolvedOriginPoint =
    origin ?? userLocation ?? originLocation ?? (places.length > 0 ? GARDEN_RING_CENTER : null);
  const projectedOrigin = resolvedOriginPoint
    ? projectLocationToPoint(resolvedOriginPoint, viewport)
    : null;
  const shouldShowOrigin =
    (showOriginDot ?? showUserLocation) && Boolean(projectedOrigin) && !dimmed;

  return (
    <div
      data-testid="places-map"
      data-map-theme={resolvedTheme}
      className={clsx(
        'relative w-full overflow-hidden bg-map-land text-ink select-none',
        className,
      )}
      style={{ minHeight: `${String(mapHeight)}px` }}
      {...rest}
    >
      <div
        className={clsx('absolute inset-0 transition-opacity duration-200', dimmed && 'opacity-70')}
      >
        <svg
          viewBox="0 0 360 440"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          data-testid="places-map-backdrop"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <rect width="360" height="440" style={{ fill: 'var(--color-map-land)' }} />
          <path
            d="M-10 338 C 60 310 110 372 170 342 S 262 264 302 312 S 342 392 380 372"
            style={{ fill: 'none', stroke: 'var(--color-map-water)', strokeWidth: 20 }}
          />
          <path
            d="M70 116 q34 -22 66 2 q8 30 -24 40 q-44 2 -42 -42z"
            style={{ fill: 'var(--color-map-park)' }}
          />
          <path
            d="M236 270 q30 -10 46 12 q-6 24 -34 22 q-20 -8 -12 -34z"
            style={{ fill: 'var(--color-map-park)' }}
          />
          <g style={{ fill: 'none', stroke: 'var(--color-map-road)', strokeWidth: 1.5 }}>
            <path d="M180 0 L 176 440" />
            <path d="M0 190 L 360 216" />
            <path d="M40 40 L 300 420" />
            <path d="M330 50 L 40 410" />
            <path d="M0 270 L 360 140" />
            <path d="M110 0 L 120 440" />
            <path d="M260 0 L 250 440" />
          </g>
          <path
            data-testid="places-map-garden-ring"
            d="M180 64 C 288 64 332 150 328 236 C 324 332 252 394 178 392 C 94 390 36 326 38 230 C 40 136 92 64 180 64 Z"
            style={{ fill: 'none', stroke: 'var(--color-map-ring)', strokeWidth: 3 }}
          />
        </svg>

        {mapHeight >= 260 && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <span className="absolute top-24 left-[62px] font-ui text-[11px] leading-none font-semibold tracking-[0.08em] text-map-label uppercase">
              ПАТРИКИ
            </span>
            <span className="absolute top-[98px] left-[236px] font-ui text-[11px] leading-none font-semibold tracking-[0.08em] text-map-label uppercase">
              ЧИСТЫЕ ПРУДЫ
            </span>
            <span className="absolute top-[186px] left-[134px] font-ui text-[11px] leading-none font-semibold tracking-[0.08em] text-map-label uppercase">
              КИТАЙ-ГОРОД
            </span>
            <span className="absolute top-[210px] left-[52px] font-ui text-[11px] leading-none font-semibold tracking-[0.08em] text-map-label uppercase">
              АРБАТ
            </span>
            <span className="absolute top-[308px] left-[196px] font-ui text-[11px] leading-none font-semibold tracking-[0.08em] text-map-label uppercase">
              ЗАМОСКВОРЕЧЬЕ
            </span>
          </div>
        )}

        <div
          ref={mapContainerRef}
          data-testid="maplibre-canvas-Host"
          className="pointer-events-none absolute inset-0 opacity-85"
        />
      </div>

      {shouldShowOrigin && projectedOrigin && (
        <div
          style={{
            left: `${String(projectedOrigin.x)}px`,
            top: `${String(projectedOrigin.y)}px`,
          }}
          className="pointer-events-none absolute z-[1] -translate-x-1/2 -translate-y-1/2"
        >
          {originMetroName && !userLocation ? (
            <MetroStation variant="origin" name={originMetroName} />
          ) : (
            <MyLocationDot />
          )}
        </div>
      )}

      <div
        role="group"
        aria-label="Метки на карте"
        className="pointer-events-none absolute inset-0 z-[2]"
      >
        {nodes.map((node) => {
          if (node.kind === 'cluster') {
            return (
              <button
                key={node.id}
                type="button"
                aria-label={`Кластер: ${String(node.count)} мест`}
                onClick={() => {
                  if (onClusterClick) {
                    onClusterClick(node);
                  } else {
                    const firstItem = node.items[0];
                    const firstPlace = node.places[0];
                    if (firstPlace && firstItem) {
                      onSelectPlace?.(firstPlace.id, firstItem);
                    }
                  }
                }}
                style={{
                  left: `${String(node.x)}px`,
                  top: `${String(node.y)}px`,
                }}
                className={clsx(
                  'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-[2.5px] focus-visible:outline-offset-2 focus-visible:outline-ink',
                  node.muted && 'opacity-35',
                )}
              >
                <StickerCluster count={node.count} types={node.types} aria-hidden="true" />
              </button>
            );
          }

          return (
            <button
              key={node.id}
              type="button"
              aria-label={node.place.name}
              data-testid={`map-marker-${node.place.id}`}
              data-place-marker={node.id}
              data-selected={node.selected ? 'true' : 'false'}
              onClick={() => {
                onSelectPlace?.(node.place.id, node.item);
              }}
              style={{
                left: `${String(node.x)}px`,
                top: `${String(node.y)}px`,
              }}
              className={clsx(
                'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-0 bg-transparent p-0 transition-opacity duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-2 focus-visible:outline-ink',
                node.selected ? 'z-10' : 'z-[2]',
                node.muted && 'opacity-35',
              )}
            >
              <Sticker
                type={node.place.type}
                state={node.state}
                placeId={node.place.id}
                name={node.place.name}
                tilt={node.place.id}
                inEvening={node.inEvening}
                badge={
                  showOrderBadges ? (
                    <span className="font-mono text-[13px] leading-none font-semibold">
                      {node.orderIndex}
                    </span>
                  ) : undefined
                }
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {children}
    </div>
  );
}
