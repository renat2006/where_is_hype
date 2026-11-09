import type {
  Candidate,
  Location,
  Place,
  PlaceMetro,
  PlaceType,
  Platform,
  SourcePlatform,
} from '@where-is-hype/core';
import {
  candidateSchema,
  detectPlatform,
  distanceM,
  placeMetroSchema,
  placeSchema,
  placeTypeLabel,
  placeTypes,
  placeTypeSchema,
  platformLabel,
  platforms,
  platformSchema,
  sourcePlatformSchema,
} from '@where-is-hype/core';

import type { MatchStatus, ResolvedCandidate } from '@/shared/api';
import {
  apiPlaceSchema,
  GARDEN_RING_CENTER,
  GARDEN_RING_RADIUS_M,
  isInsideGardenRing,
  matchStatusSchema,
  resolvedCandidateSchema,
} from '@/shared/api';

export const MIN_SEARCH_QUERY_LENGTH = 2;

export type EvidenceSourceLabel = 'речь' | 'текст на экране' | 'подпись' | 'кадры';

export function formatEvidenceSource(
  evidence: string | null | undefined,
): EvidenceSourceLabel | null {
  if (!evidence) {
    return null;
  }
  const normalized = evidence.trim().toLowerCase();
  switch (normalized) {
    case 'speech':
    case 'audio':
    case 'voice':
    case 'речь':
      return 'речь';
    case 'on_screen_text':
    case 'ocr':
    case 'screen_text':
    case 'текст на экране':
      return 'текст на экране';
    case 'caption':
    case 'description':
    case 'post_text':
    case 'подпись':
      return 'подпись';
    case 'visual':
    case 'frame':
    case 'frames':
    case 'video':
    case 'кадры':
      return 'кадры';
    default:
      return null;
  }
}

export function resolveEvidenceQuote(
  candidate:
    Pick<ResolvedCandidate, 'evidenceQuote' | 'quote'> | Candidate | Place | null | undefined,
): string | null {
  if (!candidate || !('confidence' in candidate)) {
    return null;
  }
  const rawQuote =
    ('evidenceQuote' in candidate && typeof candidate.evidenceQuote === 'string'
      ? candidate.evidenceQuote
      : null) ??
    ('quote' in candidate && typeof candidate.quote === 'string' ? candidate.quote : null);
  const trimmed = rawQuote?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'chain' | 'not_found';

export interface ConfidenceBadgeInfo {
  level: ConfidenceLevel;
  label: string;
  confidencePercent: number;
}

export function resolveMatchStatus(
  candidate:
    | Pick<ResolvedCandidate, 'matchStatus' | 'status' | 'isChain' | 'place' | 'confidence'>
    | Candidate
    | Place
    | null
    | undefined,
): MatchStatus {
  if (!candidate || !('confidence' in candidate)) {
    return 'exact';
  }
  const explicit =
    ('matchStatus' in candidate ? candidate.matchStatus : undefined) ??
    ('status' in candidate ? candidate.status : undefined);
  if (explicit) {
    return explicit;
  }
  if ('isChain' in candidate && candidate.isChain && !candidate.place) {
    return 'chain_ambiguous';
  }
  if (!candidate.place) {
    return 'not_found';
  }
  return candidate.confidence >= 0.85 ? 'exact' : 'ambiguous';
}

export function resolveConfidenceBadge(
  candidate:
    | Pick<ResolvedCandidate, 'confidence' | 'matchStatus' | 'status' | 'isChain' | 'place'>
    | Candidate
    | Place
    | null
    | undefined,
): ConfidenceBadgeInfo | null {
  if (!candidate || !('confidence' in candidate)) {
    return null;
  }
  const status = resolveMatchStatus(candidate);
  const confidencePercent = Math.round(candidate.confidence * 100);

  if (status === 'chain_ambiguous') {
    return {
      level: 'chain',
      label: 'Сеть без адреса · выберите филиал',
      confidencePercent,
    };
  }
  if (status === 'not_found') {
    return {
      level: 'not_found',
      label: 'Не нашли в базе',
      confidencePercent,
    };
  }
  if (status === 'exact' && candidate.confidence >= 0.8) {
    return {
      level: 'high',
      label: 'Высокая уверенность · точное совпадение',
      confidencePercent,
    };
  }
  if (candidate.confidence >= 0.6) {
    return {
      level: 'medium',
      label: 'Средняя уверенность · проверьте адрес',
      confidencePercent,
    };
  }
  return {
    level: 'low',
    label: 'Низкая уверенность · возможный вариант',
    confidencePercent,
  };
}

export function normalizeSearchQuery(query: string): string {
  return query.trim();
}

export function canSearchPlaces(query: string): boolean {
  return normalizeSearchQuery(query).length >= MIN_SEARCH_QUERY_LENGTH;
}

export function sortPlacesByDistance<T extends { location: Location }>(
  places: readonly T[],
  origin: Location,
): T[] {
  return [...places].sort((a, b) => distanceM(a.location, origin) - distanceM(b.location, origin));
}

export function findNearestBranch(
  branches: readonly Place[],
  origin?: Location | null,
): Place | null {
  if (branches.length === 0) {
    return null;
  }
  if (origin) {
    const sorted = sortPlacesByDistance(branches, origin);
    return sorted[0] ?? null;
  }
  const sortedByMetro = [...branches].sort((a, b) => {
    const distA = a.metro.distanceM > 0 ? a.metro.distanceM : Number.MAX_SAFE_INTEGER;
    const distB = b.metro.distanceM > 0 ? b.metro.distanceM : Number.MAX_SAFE_INTEGER;
    return distA - distB;
  });
  return sortedByMetro[0] ?? null;
}

export {
  apiPlaceSchema,
  candidateSchema,
  detectPlatform,
  GARDEN_RING_CENTER,
  GARDEN_RING_RADIUS_M,
  isInsideGardenRing,
  matchStatusSchema,
  placeMetroSchema,
  placeSchema,
  placeTypeLabel,
  placeTypes,
  placeTypeSchema,
  platformLabel,
  platforms,
  platformSchema,
  resolvedCandidateSchema,
  sourcePlatformSchema,
};
export type {
  Candidate,
  MatchStatus,
  Place,
  PlaceMetro,
  PlaceType,
  Platform,
  ResolvedCandidate,
  SourcePlatform,
};
