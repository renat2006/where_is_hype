import type { Shortlist } from '@where-is-hype/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { demoSeedPlacesFixture } from '@/shared/api';

import {
  clearYesterdayCheckDismissals,
  dismissYesterdayCheck,
  getShortlistCheckKey,
  isShortlistFromPreviousDay,
  isYesterdayCheckDismissed,
  resolveShortlistPlaces,
  shouldShowYesterdayCheck,
} from './yesterday-check-model';

const sampleShortlist: Shortlist = {
  token: 's1',
  places: demoSeedPlacesFixture.slice(0, 2).map((item) => item.place),
  createdAt: '2026-10-26T18:00:00.000Z', // 21:00 MSK on Oct 26
  expiresAt: '2026-11-02T18:00:00.000Z',
  votes: [],
};

describe('yesterday-check-model', () => {
  beforeEach(() => {
    clearYesterdayCheckDismissals();
  });

  afterEach(() => {
    clearYesterdayCheckDismissals();
  });

  it('returns false on the same Moscow day and true on the next Moscow day', () => {
    const sameEvening = new Date('2026-10-26T20:00:00.000Z'); // 23:00 MSK on Oct 26
    expect(isShortlistFromPreviousDay(sampleShortlist, sameEvening)).toBe(false);
    expect(shouldShowYesterdayCheck({ shortlist: sampleShortlist, now: sameEvening })).toBe(false);

    const nextMorning = new Date('2026-10-27T07:00:00.000Z'); // 10:00 MSK on Oct 27
    expect(isShortlistFromPreviousDay(sampleShortlist, nextMorning)).toBe(true);
    expect(shouldShowYesterdayCheck({ shortlist: sampleShortlist, now: nextMorning })).toBe(true);
  });

  it('does not show when shortlist is empty or dismissed', () => {
    const nextMorning = new Date('2026-10-27T07:00:00.000Z');

    expect(
      shouldShowYesterdayCheck({
        shortlist: { ...sampleShortlist, places: [] },
        now: nextMorning,
      }),
    ).toBe(false);

    const key = getShortlistCheckKey(sampleShortlist);
    expect(isYesterdayCheckDismissed(key)).toBe(false);

    dismissYesterdayCheck(key);
    expect(isYesterdayCheckDismissed(key)).toBe(true);
    expect(shouldShowYesterdayCheck({ shortlist: sampleShortlist, now: nextMorning })).toBe(false);
  });

  it('resolves shortlist places from demo seed and catalog fixtures', () => {
    const entries = resolveShortlistPlaces(['sosny', 'myata-na-kryshe']);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.place.name).toBe('Сосны');
    expect(entries[1]?.place.name).toBe('Мята на крыше');
  });
});
