import type { Place, Shortlist, Vote } from '@where-is-hype/core';
import {
  createShortlistExpiresAt,
  SHORTLIST_MAX_PLACES,
  SHORTLIST_TTL_DAYS,
  SHORTLIST_TTL_MS,
  shortlistSchema,
  tally,
  upsertVote,
  voteSchema,
} from '@where-is-hype/core';

import { getOrCreateBrowserVoterId, VOTER_ID_STORAGE_KEY } from '@/shared/api';

export const SHORTLIST_MIN_SHARE_PLACES = 2;

export function isInShortlist(
  shortlist: Pick<Shortlist, 'places'> | null | undefined,
  placeId: string,
): boolean {
  if (!shortlist) {
    return false;
  }
  return shortlist.places.some((place) => place.id === placeId);
}

export function canAddToShortlist(
  shortlist: Pick<Shortlist, 'places'> | null | undefined,
): boolean {
  return (shortlist?.places.length ?? 0) < SHORTLIST_MAX_PLACES;
}

export function canShareShortlist(
  shortlist: Pick<Shortlist, 'places'> | null | undefined,
): boolean {
  const count = shortlist?.places.length ?? 0;
  return count >= SHORTLIST_MIN_SHARE_PLACES && count <= SHORTLIST_MAX_PLACES;
}

export function toggleShortlistPlaceIds(
  currentPlaceIds: readonly string[],
  placeId: string,
): string[] {
  const unique = Array.from(new Set(currentPlaceIds));
  if (unique.includes(placeId)) {
    return unique.filter((id) => id !== placeId);
  }
  if (unique.length >= SHORTLIST_MAX_PLACES) {
    return unique;
  }
  return [...unique, placeId];
}

export function getShortlistLeader(
  shortlist: Pick<Shortlist, 'places' | 'votes'>,
): { place: Place; votes: number } | null {
  const counts = tally(shortlist.votes);
  let bestPlace: Place | null = null;
  let bestVotes = 0;

  for (const place of shortlist.places) {
    const count = counts[place.id] ?? 0;
    if (count > bestVotes) {
      bestVotes = count;
      bestPlace = place;
    }
  }

  return bestPlace ? { place: bestPlace, votes: bestVotes } : null;
}

export function getVoterId(): string {
  return getOrCreateBrowserVoterId();
}

export {
  createShortlistExpiresAt,
  SHORTLIST_MAX_PLACES,
  SHORTLIST_TTL_DAYS,
  SHORTLIST_TTL_MS,
  shortlistSchema,
  tally,
  upsertVote,
  VOTER_ID_STORAGE_KEY,
  voteSchema,
};
export type { Shortlist, Vote };
