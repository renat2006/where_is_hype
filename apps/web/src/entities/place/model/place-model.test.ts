import { describe, expect, it } from 'vitest';

import {
  canSearchPlaces,
  findNearestBranch,
  formatEvidenceSource,
  GARDEN_RING_CENTER,
  isInsideGardenRing,
  normalizeSearchQuery,
  resolveConfidenceBadge,
  resolvedCandidateSchema,
  resolveEvidenceQuote,
  resolveMatchStatus,
  sortPlacesByDistance,
} from './place-model';

describe('place-model', () => {
  it('validates search query length from 2nd character', () => {
    expect(normalizeSearchQuery('  Жу  ')).toBe('Жу');
    expect(canSearchPlaces('Ж')).toBe(false);
    expect(canSearchPlaces('  а ')).toBe(false);
    expect(canSearchPlaces('Жу')).toBe(true);
  });

  it('checks Garden Ring coordinates and sorts places by distance', () => {
    expect(isInsideGardenRing(GARDEN_RING_CENTER)).toBe(true);
    expect(isInsideGardenRing({ lat: 55.85, lng: 37.6173 })).toBe(false);

    const items = [
      { id: 'far', location: { lat: 55.77, lng: 37.65 } },
      { id: 'near', location: { lat: 55.756, lng: 37.618 } },
    ];

    const sorted = sortPlacesByDistance(items, GARDEN_RING_CENTER);
    expect(sorted.map((item) => item.id)).toEqual(['near', 'far']);
  });

  it('maps evidence sources, quotes, confidence badges, and nearest branches', () => {
    expect(formatEvidenceSource('speech')).toBe('речь');
    expect(formatEvidenceSource('audio')).toBe('речь');
    expect(formatEvidenceSource('on_screen_text')).toBe('текст на экране');
    expect(formatEvidenceSource('ocr')).toBe('текст на экране');
    expect(formatEvidenceSource('caption')).toBe('подпись');
    expect(formatEvidenceSource('frame')).toBe('кадры');
    expect(formatEvidenceSource('visual')).toBe('кадры');
    expect(formatEvidenceSource('unknown')).toBeNull();

    const parsed = resolvedCandidateSchema.parse({
      place: null,
      confidence: 0.4,
      matchStatus: 'chain_ambiguous',
      isChain: true,
      extractedName: 'Surf Coffee',
      evidence: 'frame',
      evidenceQuote: '  Стаканчик Surf Coffee  ',
      branchCandidates: [
        {
          id: 'b-far',
          name: 'Surf Coffee Far',
          type: 'coffee',
          address: '',
          metro: { name: '', distanceM: 500 },
          location: { lat: 55.78, lng: 37.65 },
          hours: null,
          avgCheck: null,
          yandexOrgId: null,
        },
        {
          id: 'b-near',
          name: 'Surf Coffee Near',
          type: 'coffee',
          address: 'ул. Солянка, 1',
          metro: { name: 'Китай-город', distanceM: 200 },
          location: { lat: 55.7559, lng: 37.6175 },
          hours: null,
          avgCheck: null,
          yandexOrgId: null,
        },
      ],
    });

    expect(resolveMatchStatus(parsed)).toBe('chain_ambiguous');
    expect(resolveEvidenceQuote(parsed)).toBe('Стаканчик Surf Coffee');
    expect(resolveConfidenceBadge(parsed)?.level).toBe('chain');
    expect(findNearestBranch(parsed.branchCandidates)?.id).toBe('b-near');
    expect(findNearestBranch(parsed.branchCandidates, GARDEN_RING_CENTER)?.id).toBe('b-near');
  });
});
