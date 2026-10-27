import {
  candidateSchema,
  placeSchema,
  savedPlaceSchema,
  shortlistSchema,
} from '@where-is-hype/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  apiDelete,
  ApiError,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  DEMO_RECOGNIZED_LINK,
  DEMO_UNKNOWN_LINK,
  enableMocks,
  getStandardDelayMs,
  readMockState,
  reportPlaceResponseSchema,
  resetMockState,
  RESOLVE_LINK_DELAY_MS,
  sessionSchema,
  STANDARD_DELAY_RANGE_MS,
} from '@/shared/api';

describe('MSW handlers with localStorage persistence', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    resetMockState();
  });

  it('defines delay configuration within 300-800ms and 1500ms for resolve', () => {
    expect(STANDARD_DELAY_RANGE_MS).toEqual([300, 800]);
    expect(RESOLVE_LINK_DELAY_MS).toBe(1500);
    expect(getStandardDelayMs(0)).toBe(300);
    expect(getStandardDelayMs(0.5)).toBe(550);
    expect(getStandardDelayMs(0.9999)).toBe(800);
  });

  it('creates an anonymous session via POST /me and starts with empty saved places', async () => {
    const initialSession = await apiGet('/me', sessionSchema.nullable());
    expect(initialSession).toBeNull();

    const created = await apiPost('/me', sessionSchema);
    expect(created.id).toMatch(/^usr-/);

    const again = await apiPost('/me', sessionSchema);
    expect(again.id).toBe(created.id);

    const saved = await apiGet('/me/places', z.array(savedPlaceSchema));
    expect(saved).toEqual([]);
  });

  it('searches places starting from the 2nd character', async () => {
    const oneChar = await apiGet('/places/search?q=%D0%96', z.array(placeSchema));
    expect(oneChar).toEqual([]);

    const twoChars = await apiGet('/places/search?q=%D0%96%D1%83', z.array(placeSchema));
    expect(twoChars.length).toBeGreaterThanOrEqual(3);
    const names = twoChars.map((place) => place.name);
    expect(names).toContain('Журавли');
    expect(names).toContain('Жук и Пчела');
    expect(names).toContain('Жужжалка');
  });

  it('resolves links deterministically and returns 0 candidates for unknown, private or pathless URLs', async () => {
    const recognized = await apiPost('/links/resolve', z.array(candidateSchema), {
      url: DEMO_RECOGNIZED_LINK,
    });
    expect(recognized.length).toBeGreaterThanOrEqual(2);
    expect(recognized.length).toBeLessThanOrEqual(3);
    expect(recognized[0]?.place.type).toBe('coffee');
    expect(recognized[0]?.place.id).toBe('zhuk-i-pchela');
    expect(recognized[0]?.place.address).toBeTruthy();
    expect(recognized[0]?.place.metro.name).toBeTruthy();

    const unknown = await apiPost('/links/resolve', z.array(candidateSchema), {
      url: DEMO_UNKNOWN_LINK,
    });
    expect(unknown).toEqual([]);

    const privateUrl = await apiPost('/links/resolve', z.array(candidateSchema), {
      url: 'https://www.instagram.com/p/private-post/',
    });
    expect(privateUrl).toEqual([]);

    const rootOnlyUrl = await apiPost('/links/resolve', z.array(candidateSchema), {
      url: 'https://www.instagram.com/',
    });
    expect(rootOnlyUrl).toEqual([]);

    const customA = await apiPost('/links/resolve', z.array(candidateSchema), {
      url: 'https://t.me/food_moscow/555',
    });
    const customB = await apiPost('/links/resolve', z.array(candidateSchema), {
      url: 'https://t.me/food_moscow/555',
    });
    expect(customA).toHaveLength(3);
    expect(customA).toEqual(customB);
  });

  it('handles CRUD on /me/places, returns 409 on duplicate place or link, and manages visits', async () => {
    const saved = await apiPost('/me/places', savedPlaceSchema, {
      placeId: 'zhuk-i-pchela',
      sourceUrl: DEMO_RECOGNIZED_LINK,
      note: 'раф с халвой',
    });
    expect(saved.place.id).toBe('zhuk-i-pchela');
    expect(saved.sourcePlatform).toBe('instagram');
    expect(saved.note).toBe('раф с халвой');

    // Duplicate by placeId -> 409
    await expect(
      apiPost('/me/places', savedPlaceSchema, {
        placeId: 'zhuk-i-pchela',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        message: 'Уже в твоих местах',
      }),
    );

    // Duplicate by sourceUrl -> 409
    await expect(
      apiPost('/me/places', savedPlaceSchema, {
        placeId: 'pokrovka-coffee',
        sourceUrl: DEMO_RECOGNIZED_LINK,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        message: 'Уже в твоих местах',
      }),
    );

    // Update note via PATCH /me/places/:id
    const updatedNote = await apiPatch('/me/places/zhuk-i-pchela', savedPlaceSchema, {
      note: 'новая заметка',
    });
    expect(updatedNote.note).toBe('новая заметка');

    // Mark visit via POST /me/places/:id/visits (verified within 200m)
    const withVisit = await apiPost('/me/places/zhuk-i-pchela/visits', savedPlaceSchema, {
      location: saved.place.location,
    });
    expect(withVisit.visits).toHaveLength(1);
    expect(withVisit.visits[0]?.verified).toBe(true);

    // Second visit on the same day -> 409
    await expect(
      apiPost('/me/places/zhuk-i-pchela/visits', savedPlaceSchema, {
        verified: true,
      }),
    ).rejects.toBeInstanceOf(ApiError);

    // Patch expectation on the visit
    const withExpectation = await apiPatch('/me/places/zhuk-i-pchela/visits', savedPlaceSchema, {
      expectation: 'better',
      comment: 'Очень вкусный фильтр',
    });
    expect(withExpectation.visits[0]?.expectation).toBe('better');
    expect(withExpectation.visits[0]?.comment).toBe('Очень вкусный фильтр');

    // Delete place
    await apiDelete('/me/places/zhuk-i-pchela');
    const afterDelete = await apiGet('/me/places', z.array(savedPlaceSchema));
    expect(afterDelete).toHaveLength(0);
  });

  it('manages shortlist, sharing, and replaces vote when repeated from the same browser', async () => {
    const emptyShortlist = await apiGet('/me/shortlist', shortlistSchema);
    expect(emptyShortlist.places).toEqual([]);

    // Reject more than 5 places
    await expect(
      apiPut('/me/shortlist', shortlistSchema, {
        placeIds: [
          'zhuk-i-pchela',
          'pokrovka-coffee',
          'zerno',
          'myata-na-kryshe',
          'sosny',
          'zhuravli',
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });

    const updated = await apiPut('/me/shortlist', shortlistSchema, {
      placeIds: ['sosny', 'zhuk-i-pchela', 'myata-na-kryshe'],
    });
    expect(updated.places).toHaveLength(3);

    const shared = await apiPost('/me/shortlist/share', shortlistSchema);
    expect(shared.token).toBeTruthy();

    const byToken = await apiGet(`/s/${shared.token}`, shortlistSchema);
    expect(byToken.places).toHaveLength(3);

    // First vote from browser
    const votedOnce = await apiPost(`/s/${shared.token}/votes`, shortlistSchema, {
      name: 'АК',
      placeIds: ['sosny'],
    });
    expect(votedOnce.votes).toHaveLength(1);
    expect(votedOnce.votes[0]?.placeIds).toEqual(['sosny']);

    // Second vote from the same browser replaces previous vote
    const votedTwice = await apiPost(`/s/${shared.token}/votes`, shortlistSchema, {
      name: 'АК',
      placeIds: ['zhuk-i-pchela', 'myata-na-kryshe'],
    });
    expect(votedTwice.votes).toHaveLength(1);
    expect(votedTwice.votes[0]?.placeIds).toEqual(['zhuk-i-pchela', 'myata-na-kryshe']);

    // Author sees the updated votes in /me/shortlist
    const authorView = await apiGet('/me/shortlist', shortlistSchema);
    expect(authorView.votes).toHaveLength(1);
    expect(authorView.votes[0]?.placeIds).toEqual(['zhuk-i-pchela', 'myata-na-kryshe']);
  });

  it('seeds 8 demo places via POST /demo/seed and records reports and analytics events', async () => {
    const seeded = await apiPost('/demo/seed', z.array(savedPlaceSchema));
    expect(seeded).toHaveLength(8);

    const report = await apiPost('/reports', reportPlaceResponseSchema, {
      query: 'Новое кафе на Покровке',
      sourceUrl: DEMO_UNKNOWN_LINK,
    });
    expect(report.query).toBe('Новое кафе на Покровке');

    const eventRes = await apiPost('/events', z.object({ ok: z.boolean() }), {
      event: 'link_pasted',
      anonymousId: 'anon-123',
      timestamp: new Date().toISOString(),
    });
    expect(eventRes.ok).toBe(true);

    const state = readMockState();
    expect(state.savedPlaces).toHaveLength(8);
    expect(state.reports).toHaveLength(1);
    expect(state.events).toHaveLength(1);
  });
});
