import type { Location, Place, SavedPlace } from '@where-is-hype/core';

import { demoSeedPlacesFixture, placesFixture } from '@/shared/api';

export interface YandexMapsRouteLinks {
  schemeUrl: string;
  webUrl: string;
}

export interface OpenYandexMapsRouteOptions {
  openScheme?: ((url: string) => void) | undefined;
  openWeb?: ((url: string) => void) | undefined;
  preferScheme?: boolean | undefined;
  fallbackDelayMs?: number | undefined;
}

function formatRouteCoords(destination: Location, origin?: Location | null): string {
  const destPart = `${String(destination.lat)},${String(destination.lng)}`;
  if (origin) {
    const originPart = `${String(origin.lat)},${String(origin.lng)}`;
    return `${originPart}~${destPart}`;
  }
  return `~${destPart}`;
}

export function buildYandexMapsRouteSchemeUrl(
  destination: Location,
  origin?: Location | null,
): string {
  const rtext = formatRouteCoords(destination, origin);
  return `yandexmaps://maps.yandex.ru/?rtext=${rtext}&rtt=mt`;
}

export function buildYandexMapsRouteWebUrl(
  destination: Location,
  origin?: Location | null,
): string {
  const rtext = formatRouteCoords(destination, origin);
  return `https://yandex.ru/maps/?rtext=${rtext}&rtt=mt`;
}

export function buildYandexMapsRouteLinks(
  destination: Location,
  origin?: Location | null,
): YandexMapsRouteLinks {
  return {
    schemeUrl: buildYandexMapsRouteSchemeUrl(destination, origin),
    webUrl: buildYandexMapsRouteWebUrl(destination, origin),
  };
}

export function openYandexMapsRoute(
  destination: Location,
  origin?: Location | null,
  options?: OpenYandexMapsRouteOptions,
): YandexMapsRouteLinks {
  const links = buildYandexMapsRouteLinks(destination, origin);
  const openWeb =
    options?.openWeb ??
    ((url: string) => {
      if (typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });

  if (options?.preferScheme && options.openScheme) {
    options.openScheme(links.schemeUrl);
    const delayMs = options.fallbackDelayMs ?? 600;
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
          openWeb(links.webUrl);
        }
      }, delayMs);
    }
    return links;
  }

  openWeb(links.webUrl);
  return links;
}

export function buildYandexMapsReviewsUrl(
  place: Pick<Place, 'name' | 'address' | 'yandexOrgId'>,
): string {
  const orgId = place.yandexOrgId?.trim();
  if (orgId) {
    return `https://yandex.ru/maps/org/${encodeURIComponent(orgId)}/reviews/`;
  }
  const query = `${place.name.trim()}, ${place.address.trim()}`;
  return `https://yandex.ru/maps/?text=${encodeURIComponent(query)}`;
}

export function estimatePlaceTitleLines(name: string, charsPerLine = 12): number {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 1;
  }

  let lines = 1;
  let currentLineLength = 0;

  for (const word of words) {
    if (currentLineLength === 0) {
      currentLineLength = word.length;
      while (currentLineLength > charsPerLine) {
        lines += 1;
        currentLineLength -= charsPerLine;
      }
    } else if (currentLineLength + 1 + word.length <= charsPerLine) {
      currentLineLength += 1 + word.length;
    } else {
      lines += 1;
      currentLineLength = word.length;
      while (currentLineLength > charsPerLine) {
        lines += 1;
        currentLineLength -= charsPerLine;
      }
    }
  }

  return lines;
}

export function isLongPlaceTitle(name: string): boolean {
  return estimatePlaceTitleLines(name) >= 3 || name.trim().length >= 28;
}

export function getPlaceViewTransitionName(placeId: string): string {
  return `place-${placeId}`;
}

interface DocumentWithViewTransition {
  startViewTransition?: (callback: () => void) => unknown;
}

export function supportsViewTransition(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const doc = document as unknown as DocumentWithViewTransition;
  return typeof doc.startViewTransition === 'function';
}

export function runWithViewTransition(callback: () => void): void {
  if (!supportsViewTransition()) {
    callback();
    return;
  }

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    callback();
    return;
  }

  const doc = document as unknown as DocumentWithViewTransition;
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(callback);
    return;
  }

  callback();
}

export function resolveSavedPlaceForCard(
  placeId: string,
  savedPlaces: readonly SavedPlace[] | undefined,
  catalogPlaces: readonly Place[] | undefined,
): SavedPlace | null {
  const fromSaved = savedPlaces?.find((item) => item.place.id === placeId);
  if (fromSaved) {
    return fromSaved;
  }

  const fromDemoSeed = demoSeedPlacesFixture.find((item) => item.place.id === placeId);
  if (fromDemoSeed) {
    return fromDemoSeed;
  }

  const catalog = catalogPlaces ?? placesFixture;
  const fromCatalog = catalog.find((item) => item.id === placeId);
  if (fromCatalog) {
    return {
      place: fromCatalog,
      sourceUrl: null,
      sourcePlatform: 'other',
      note: '',
      addedAt: '2026-10-27T12:00:00.000Z',
      visits: [],
    };
  }

  return null;
}
