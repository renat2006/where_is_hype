import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ANALYTICS_EVENTS, ANON_ID_STORAGE_KEY, getAnonymousId, track } from './analytics';

describe('analytics lib', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes all 12 funnel events from US10', () => {
    expect(ANALYTICS_EVENTS).toEqual([
      'link_pasted',
      'candidates_shown',
      'place_saved',
      'map_opened',
      'filter_applied',
      'card_opened',
      'route_clicked',
      'shortlist_shared',
      'friend_page_opened',
      'friend_voted',
      'visit_marked',
      'expectation_answered',
    ]);
  });

  it('creates and reuses an anonymous id in localStorage', () => {
    const firstId = getAnonymousId();
    expect(firstId.length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(ANON_ID_STORAGE_KEY)).toBe(firstId);

    const secondId = getAnonymousId();
    expect(secondId).toBe(firstId);
  });

  it('sends POST /events via fetch without waiting and logs in dev', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const payload = track('place_saved', { source: 'link' });

    expect(payload.event).toBe('place_saved');
    expect(payload.anonymousId).toBe(window.localStorage.getItem(ANON_ID_STORAGE_KEY));
    expect(payload.props).toEqual({ source: 'link' });
    expect(typeof payload.timestamp).toBe('string');

    expect(warnSpy).toHaveBeenCalledWith('[analytics]', payload);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(typeof url).toBe('string');
    if (typeof url === 'string') {
      expect(url).toMatch(/\/events$/);
    }
    expect(init?.method).toBe('POST');
    expect(typeof init?.body).toBe('string');
    if (typeof init?.body === 'string') {
      expect(JSON.parse(init.body)).toEqual(payload);
    }
  });
});
