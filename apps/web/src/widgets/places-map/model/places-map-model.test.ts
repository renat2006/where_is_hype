import { describe, expect, it } from 'vitest';

import { demoSeedPlacesFixture, placesFixture } from '@/shared/api';

import {
  clusterMapPlaces,
  createZinMapStyle,
  GARDEN_RING_GEOJSON,
  ZIN_MAP_PALETTE,
} from './places-map-model';

describe('places-map-model', () => {
  it('creates day and night MapLibre styles with map-* layers and Garden Ring', () => {
    const dayStyle = createZinMapStyle('day');
    const nightStyle = createZinMapStyle('night');

    expect(dayStyle.name).toBe('zin-day');
    expect(nightStyle.name).toBe('zin-night');

    const layerIds = dayStyle.layers.map((layer) => layer.id);
    expect(layerIds).toEqual([
      'map-land',
      'map-park',
      'map-water',
      'map-road',
      'map-ring',
      'map-label',
    ]);

    const dayLand = dayStyle.layers.find((l) => l.id === 'map-land');
    const nightLand = nightStyle.layers.find((l) => l.id === 'map-land');
    expect(dayLand?.paint).toEqual({ 'background-color': ZIN_MAP_PALETTE.day.land });
    expect(nightLand?.paint).toEqual({ 'background-color': ZIN_MAP_PALETTE.night.land });

    expect(GARDEN_RING_GEOJSON.features[0]?.geometry.coordinates.length).toBeGreaterThan(20);
  });

  it('clusters overlapping places and keeps selected place unclustered', () => {
    const nodes = clusterMapPlaces(placesFixture, {
      selectedPlaceId: 'sosny',
      clusterRadiusPx: 60,
    });

    const selectedMarker = nodes.find((n) => n.kind === 'marker' && n.id === 'sosny');
    expect(selectedMarker).toBeDefined();
    if (selectedMarker?.kind === 'marker') {
      expect(selectedMarker.state).toBe('selected');
    }

    const clusters = nodes.filter((n) => n.kind === 'cluster');
    expect(clusters.length).toBeGreaterThan(0);

    const totalPlacesRepresented = nodes.reduce(
      (sum, node) => sum + (node.kind === 'cluster' ? node.count : 1),
      0,
    );
    expect(totalPlacesRepresented).toBe(placesFixture.length);
  });

  it('marks visited and evening states on single markers', () => {
    const nodes = clusterMapPlaces(demoSeedPlacesFixture, {
      clusterRadiusPx: 0,
      eveningPlaceIds: ['sosny'],
    });

    const visitedNode = nodes.find((n) => n.kind === 'marker' && n.id === 'zerno');
    expect(visitedNode?.kind === 'marker' && visitedNode.state).toBe('visited');

    const eveningNode = nodes.find((n) => n.kind === 'marker' && n.id === 'sosny');
    expect(eveningNode?.kind === 'marker' && eveningNode.state).toBe('evening');
  });
});
