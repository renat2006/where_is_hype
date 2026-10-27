import type { SavedPlace } from '@where-is-hype/core';

import { ApiError, DEMO_RECOGNIZED_LINK, demoSeedPlacesFixture, readMockState } from '@/shared/api';

const DEFAULT_FALLBACK_VIDEO_URL = 'https://vt.tiktok.com/ZS8kQ2pLm/';

function normalizeExternalUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function resolveFriendPlaceVideoUrl(
  placeId: string,
  savedPlaces?: readonly SavedPlace[],
): string {
  const fromPropSaved = savedPlaces?.find((item) => item.place.id === placeId)?.sourceUrl;
  if (fromPropSaved && fromPropSaved.trim().length > 0) {
    return normalizeExternalUrl(fromPropSaved);
  }

  const fromMockSaved = readMockState().savedPlaces.find(
    (item) => item.place.id === placeId,
  )?.sourceUrl;
  if (fromMockSaved && fromMockSaved.trim().length > 0) {
    return normalizeExternalUrl(fromMockSaved);
  }

  const fromDemoSeed = demoSeedPlacesFixture.find((item) => item.place.id === placeId)?.sourceUrl;
  if (fromDemoSeed && fromDemoSeed.trim().length > 0) {
    return normalizeExternalUrl(fromDemoSeed);
  }

  if (placeId === 'zhuk-i-pchela') {
    return DEMO_RECOGNIZED_LINK;
  }

  return DEFAULT_FALLBACK_VIDEO_URL;
}

export function pluralizeAnsweredVerb(count: number): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 !== 11 && mod10 === 1) {
    return 'ответил';
  }
  return 'ответили';
}

export function isExpiredShortlistError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 410 || error.code === 'SHORTLIST_EXPIRED';
  }
  return false;
}
