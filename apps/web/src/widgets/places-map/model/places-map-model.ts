import type { Location, Place, PlaceType, SavedPlace } from '@where-is-hype/core';
import type { StyleSpecification } from 'maplibre-gl';

import { GARDEN_RING_CENTER, GARDEN_RING_RADIUS_M } from '@/entities/place';
import type { ResolvedTheme } from '@/shared/lib/theme';
import type { StickerState } from '@/shared/ui/sticker';

export const OPENFREEMAP_TILES_URL = 'https://tiles.openfreemap.org/planet';
export const OPENFREEMAP_GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export interface GardenRingFeature {
  type: 'Feature';
  properties: { name: string };
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export interface GardenRingFeatureCollection {
  type: 'FeatureCollection';
  features: GardenRingFeature[];
}

export interface ZinMapPalette {
  land: string;
  road: string;
  ring: string;
  water: string;
  park: string;
  label: string;
}

export const ZIN_MAP_PALETTE: Record<ResolvedTheme, ZinMapPalette> = {
  day: {
    land: '#EEE7D9',
    road: 'rgba(23, 20, 15, 0.17)',
    ring: 'rgba(23, 20, 15, 0.42)',
    water: '#D9D0EE',
    park: '#D3EADB',
    label: 'rgba(23, 20, 15, 0.55)',
  },
  night: {
    land: '#1D1914',
    road: 'rgba(242, 236, 225, 0.15)',
    ring: 'rgba(242, 236, 225, 0.38)',
    water: '#2A2638',
    park: '#1E2A23',
    label: 'rgba(242, 236, 225, 0.5)',
  },
};

export function createGardenRingGeoJson(
  center: Location = GARDEN_RING_CENTER,
  radiusM: number = GARDEN_RING_RADIUS_M,
  segments = 48,
): GardenRingFeatureCollection {
  const latRadiusDeg = radiusM / 111_320;
  const lngRadiusDeg = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  const coordinates: [number, number][] = [];

  for (let i = 0; i <= segments; i += 1) {
    const angle = (2 * Math.PI * i) / segments;
    const lng = Number((center.lng + lngRadiusDeg * Math.cos(angle)).toFixed(6));
    const lat = Number((center.lat + latRadiusDeg * Math.sin(angle)).toFixed(6));
    coordinates.push([lng, lat]);
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Садовое кольцо' },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      },
    ],
  };
}

export const GARDEN_RING_GEOJSON: GardenRingFeatureCollection = createGardenRingGeoJson();

export function createZinMapStyle(theme: ResolvedTheme = 'day'): StyleSpecification {
  const palette = ZIN_MAP_PALETTE[theme];

  return {
    version: 8,
    name: `zin-${theme}`,
    glyphs: OPENFREEMAP_GLYPHS_URL,
    sources: {
      openfreemap: {
        type: 'vector',
        url: OPENFREEMAP_TILES_URL,
      },
      'garden-ring': {
        type: 'geojson',
        data: GARDEN_RING_GEOJSON,
      },
    },
    layers: [
      {
        id: 'map-land',
        type: 'background',
        paint: {
          'background-color': palette.land,
        },
      },
      {
        id: 'map-park',
        type: 'fill',
        source: 'openfreemap',
        'source-layer': 'park',
        paint: {
          'fill-color': palette.park,
        },
      },
      {
        id: 'map-water',
        type: 'fill',
        source: 'openfreemap',
        'source-layer': 'water',
        paint: {
          'fill-color': palette.water,
        },
      },
      {
        id: 'map-road',
        type: 'line',
        source: 'openfreemap',
        'source-layer': 'transportation',
        paint: {
          'line-color': palette.road,
          'line-width': 1.5,
        },
      },
      {
        id: 'map-ring',
        type: 'line',
        source: 'garden-ring',
        paint: {
          'line-color': palette.ring,
          'line-width': 3,
        },
      },
      {
        id: 'map-label',
        type: 'symbol',
        source: 'openfreemap',
        'source-layer': 'place',
        layout: {
          'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
        },
        paint: {
          'text-color': palette.label,
        },
      },
    ],
  };
}

export interface MapViewport {
  width: number;
  height: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
}

export const DEFAULT_MAP_VIEWPORT: Required<MapViewport> = {
  width: 360,
  height: 440,
  paddingLeft: 44,
  paddingRight: 44,
  paddingTop: 108,
  paddingBottom: 60,
  minLat: 55.728,
  maxLat: 55.776,
  minLng: 37.58,
  maxLng: 37.66,
};

export function projectLocationToPoint(
  location: Location,
  viewport: MapViewport = DEFAULT_MAP_VIEWPORT,
): { x: number; y: number } {
  const cfg = { ...DEFAULT_MAP_VIEWPORT, ...viewport };
  const innerWidth = Math.max(1, cfg.width - cfg.paddingLeft - cfg.paddingRight);
  const innerHeight = Math.max(1, cfg.height - cfg.paddingTop - cfg.paddingBottom);

  const lngRatio = (location.lng - cfg.minLng) / Math.max(0.0001, cfg.maxLng - cfg.minLng);
  const latRatio = (cfg.maxLat - location.lat) / Math.max(0.0001, cfg.maxLat - cfg.minLat);

  const clampedLngRatio = Math.min(1, Math.max(0, lngRatio));
  const clampedLatRatio = Math.min(1, Math.max(0, latRatio));

  return {
    x: Math.round(cfg.paddingLeft + clampedLngRatio * innerWidth),
    y: Math.round(cfg.paddingTop + clampedLatRatio * innerHeight),
  };
}

export function extractMapPlace(item: Place | SavedPlace): Place {
  return 'place' in item ? item.place : item;
}

export function isMapPlaceVisited(item: Place | SavedPlace): boolean {
  return 'visits' in item && item.visits.length > 0;
}

export function resolveMapStickerState(options: {
  place: Place;
  selected: boolean;
  visited: boolean;
  inEvening: boolean;
}): StickerState {
  if (options.selected) {
    return 'selected';
  }
  if (options.visited) {
    return 'visited';
  }
  if (options.inEvening) {
    return 'evening';
  }
  if (options.place.hours === null || options.place.avgCheck === null) {
    return 'unknown';
  }
  return 'default';
}

export interface MapMarkerNode {
  kind: 'marker';
  id: string;
  place: Place;
  item: Place | SavedPlace;
  x: number;
  y: number;
  state: StickerState;
  selected: boolean;
  visited: boolean;
  inEvening: boolean;
  muted: boolean;
  orderIndex: number;
}

export interface MapClusterNode {
  kind: 'cluster';
  id: string;
  count: number;
  places: Place[];
  items: (Place | SavedPlace)[];
  types: readonly [PlaceType?, PlaceType?, PlaceType?];
  location: Location;
  x: number;
  y: number;
  muted: boolean;
}

export type MapRenderNode = MapMarkerNode | MapClusterNode;

function checkMembership(
  id: string,
  collection: readonly string[] | ReadonlySet<string> | undefined,
): boolean {
  if (!collection) {
    return false;
  }
  if (Array.isArray(collection)) {
    return collection.includes(id);
  }
  return (collection as ReadonlySet<string>).has(id);
}

export interface ClusterMapPlacesOptions {
  selectedPlaceId?: string | null | undefined;
  eveningPlaceIds?: readonly string[] | ReadonlySet<string> | undefined;
  mutedPlaceIds?: readonly string[] | ReadonlySet<string> | undefined;
  clusterRadiusPx?: number | undefined;
  viewport?: MapViewport | undefined;
  projectPoint?: ((location: Location) => { x: number; y: number }) | undefined;
}

export function clusterMapPlaces(
  items: readonly (Place | SavedPlace)[],
  options: ClusterMapPlacesOptions = {},
): MapRenderNode[] {
  const {
    selectedPlaceId,
    eveningPlaceIds,
    mutedPlaceIds,
    clusterRadiusPx = 42,
    viewport = DEFAULT_MAP_VIEWPORT,
    projectPoint,
  } = options;

  const project = projectPoint ?? ((loc: Location) => projectLocationToPoint(loc, viewport));

  const singleNodes: MapMarkerNode[] = items.map((item, index) => {
    const place = extractMapPlace(item);
    const selected = place.id === selectedPlaceId;
    const visited = isMapPlaceVisited(item);
    const inEvening = checkMembership(place.id, eveningPlaceIds);
    const muted = checkMembership(place.id, mutedPlaceIds);
    const point = project(place.location);

    return {
      kind: 'marker',
      id: place.id,
      place,
      item,
      x: point.x,
      y: point.y,
      state: resolveMapStickerState({ place, selected, visited, inEvening }),
      selected,
      visited,
      inEvening,
      muted,
      orderIndex: index + 1,
    };
  });

  if (clusterRadiusPx <= 0 || singleNodes.length <= 1) {
    return singleNodes;
  }

  interface Bucket {
    members: MapMarkerNode[];
    x: number;
    y: number;
    lockedSingle: boolean;
  }

  const buckets: Bucket[] = [];

  for (const node of singleNodes) {
    if (node.selected) {
      buckets.push({
        members: [node],
        x: node.x,
        y: node.y,
        lockedSingle: true,
      });
      continue;
    }

    let matchedBucket: Bucket | undefined;
    let bestDist = Infinity;

    for (const bucket of buckets) {
      if (bucket.lockedSingle) {
        continue;
      }
      const dx = node.x - bucket.x;
      const dy = node.y - bucket.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= clusterRadiusPx && dist < bestDist) {
        bestDist = dist;
        matchedBucket = bucket;
      }
    }

    if (matchedBucket) {
      matchedBucket.members.push(node);
      const total = matchedBucket.members.length;
      matchedBucket.x = Math.round(matchedBucket.members.reduce((sum, m) => sum + m.x, 0) / total);
      matchedBucket.y = Math.round(matchedBucket.members.reduce((sum, m) => sum + m.y, 0) / total);
    } else {
      buckets.push({
        members: [node],
        x: node.x,
        y: node.y,
        lockedSingle: false,
      });
    }
  }

  return buckets.map((bucket): MapRenderNode => {
    const first = bucket.members[0];
    if (bucket.members.length === 1 && first) {
      return first;
    }

    const places = bucket.members.map((m) => m.place);
    const bucketItems = bucket.members.map((m) => m.item);
    const total = places.length;
    const avgLat = places.reduce((sum, p) => sum + p.location.lat, 0) / Math.max(1, total);
    const avgLng = places.reduce((sum, p) => sum + p.location.lng, 0) / Math.max(1, total);

    const distinctTypes: PlaceType[] = [];
    for (const p of places) {
      if (!distinctTypes.includes(p.type)) {
        distinctTypes.push(p.type);
      }
    }

    const types: readonly [PlaceType?, PlaceType?, PlaceType?] = [
      distinctTypes[0] ?? places[0]?.type ?? 'rest',
      distinctTypes[1] ?? places[1]?.type ?? 'cafe',
      distinctTypes[2] ?? places[2]?.type ?? 'coffee',
    ];

    return {
      kind: 'cluster',
      id: `cluster-${places.map((p) => p.id).join('-')}`,
      count: total,
      places,
      items: bucketItems,
      types,
      location: { lat: avgLat, lng: avgLng },
      x: bucket.x,
      y: bucket.y,
      muted: bucket.members.every((m) => m.muted),
    };
  });
}
