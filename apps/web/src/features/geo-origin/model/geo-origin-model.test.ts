import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_METRO_STATION_ID,
  filterMetroStations,
  formatMetroOriginCta,
  GEO_ORIGIN_STORAGE_KEY,
  getStoredGeoOriginState,
  requestBrowserGeolocation,
  resetGeoOriginState,
  resolveGeoOrigin,
  selectMetroOrigin,
  useGeoOrigin,
} from './geo-origin-model';

describe('geo-origin-model', () => {
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    resetGeoOriginState();
  });

  afterEach(() => {
    resetGeoOriginState();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
  });

  it('requests geolocation only once unless forced', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 55.7612,
          longitude: 37.6285,
          accuracy: 20,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      });
    });

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    const first = await requestBrowserGeolocation();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(first.permissionStatus).toBe('granted');
    expect(first.userLocation).toEqual({ lat: 55.7612, lng: 37.6285 });

    const second = await requestBrowserGeolocation();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(second.userLocation).toEqual({ lat: 55.7612, lng: 37.6285 });

    await requestBrowserGeolocation({ force: true });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('marks needsMetroSelection on denial and persists selected metro station', async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({
          code: 1,
          message: 'User denied Geolocation',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      },
    );

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    const deniedState = await requestBrowserGeolocation();
    const resolvedDenied = resolveGeoOrigin(deniedState);
    expect(resolvedDenied.needsMetroSelection).toBe(true);

    const metroState = selectMetroOrigin('kitay-gorod');
    expect(metroState.mode).toBe('metro');
    expect(metroState.metroStationId).toBe('kitay-gorod');
    expect(window.localStorage.getItem(GEO_ORIGIN_STORAGE_KEY)).toContain('kitay-gorod');

    const resolvedMetro = resolveGeoOrigin(getStoredGeoOriginState());
    expect(resolvedMetro.needsMetroSelection).toBe(false);
    expect(resolvedMetro.kind).toBe('metro');
    expect(resolvedMetro.metroStation?.name).toBe('Китай-город');
  });

  it('filters metro stations and formats genitive CTA labels', () => {
    const defaults = filterMetroStations('');
    expect(defaults).toHaveLength(5);
    expect(defaults[0]?.id).toBe(DEFAULT_METRO_STATION_ID);

    const withCustomSelected = filterMetroStations('', 'mayakovskaya');
    expect(withCustomSelected[0]?.id).toBe('mayakovskaya');

    const searched = filterMetroStations('чист');
    expect(searched.map((s) => s.id)).toContain('chistye-prudy');

    expect(formatMetroOriginCta('Чистые пруды')).toBe('Считать от «Чистых прудов»');
    expect(formatMetroOriginCta('Тверская')).toBe('Считать от «Тверской»');
  });

  it('exposes reactive state and actions through useGeoOrigin hook', async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({
          code: 1,
          message: 'Denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      },
    );

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    const { result } = renderHook(() => useGeoOrigin());

    await waitFor(() => {
      expect(result.current.needsMetroSelection).toBe(true);
    });

    result.current.selectMetro('tverskaya');

    await waitFor(() => {
      expect(result.current.kind).toBe('metro');
      expect(result.current.metroStation?.name).toBe('Тверская');
      expect(result.current.needsMetroSelection).toBe(false);
    });
  });
});
