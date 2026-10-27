import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Place, SavedPlace } from '@where-is-hype/core';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  DEMO_RECOGNIZED_LINK,
  enableMocks,
  placesFixture,
  readMockState,
  resetMockState,
} from '@/shared/api';
import { clearToasts, useToast } from '@/shared/ui/toast';

import {
  isAlreadySavedError,
  normalizeSourceUrl,
  type SavePlaceSource,
  useSavePlaceFlow,
} from './use-save-place';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useSavePlaceFlow', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    resetMockState();
    clearToasts();
    vi.restoreAllMocks();
  });

  it('normalizes source URLs properly', () => {
    expect(normalizeSourceUrl('  https://vt.tiktok.com/abc  ')).toBe('https://vt.tiktok.com/abc');
    expect(normalizeSourceUrl('   ')).toBeNull();
    expect(normalizeSourceUrl(null)).toBeNull();
    expect(normalizeSourceUrl(undefined)).toBeNull();
  });

  it('saves a place from link, tracks place_saved event, and triggers toast', async () => {
    const wrapper = createWrapper();
    const onSaved = vi.fn<(savedPlace: SavedPlace, source: SavePlaceSource) => void>();
    const targetPlace = placesFixture.find((item) => item.id === 'zhuk-i-pchela');
    expect(targetPlace).toBeDefined();
    if (!targetPlace) {
      return;
    }

    const { result } = renderHook(() => useSavePlaceFlow({ onSaved }), { wrapper });
    const { result: toastResult } = renderHook(() => useToast());

    let outcome: Awaited<ReturnType<typeof result.current.savePlaceWithFeedback>> | undefined;
    await act(async () => {
      outcome = await result.current.savePlaceWithFeedback(targetPlace, {
        source: 'link',
        sourceUrl: DEMO_RECOGNIZED_LINK,
      });
    });

    expect(outcome?.status).toBe('saved');
    expect(onSaved).toHaveBeenCalledTimes(1);
    const firstCall = onSaved.mock.calls[0];
    expect(firstCall?.[0].place.id).toBe('zhuk-i-pchela');
    expect(firstCall?.[0].sourceUrl).toBe(DEMO_RECOGNIZED_LINK);
    expect(firstCall?.[1]).toBe('link');
    expect(toastResult.current.toast?.message).toBe('Место сохранено');

    await waitFor(() => {
      const db = readMockState();
      expect(db.savedPlaces).toHaveLength(1);
      expect(
        db.events.some((ev) => ev.event === 'place_saved' && ev.props?.source === 'link'),
      ).toBe(true);
    });
  });

  it('handles duplicate 409 ALREADY_SAVED without throwing and marks place as already saved', async () => {
    const wrapper = createWrapper();
    const onAlreadySaved = vi.fn<(placeId: string, place: Place) => void>();
    const targetPlace = placesFixture.find((item) => item.id === 'sosny');
    expect(targetPlace).toBeDefined();
    if (!targetPlace) {
      return;
    }

    const { result } = renderHook(() => useSavePlaceFlow({ onAlreadySaved }), { wrapper });

    await act(async () => {
      await result.current.savePlaceWithFeedback(targetPlace, {
        source: 'name',
        sourceUrl: 'https://instagram.com/reel/unknown-place/',
      });
    });

    let duplicateOutcome:
      Awaited<ReturnType<typeof result.current.savePlaceWithFeedback>> | undefined;
    await act(async () => {
      duplicateOutcome = await result.current.savePlaceWithFeedback(targetPlace, {
        source: 'name',
      });
    });

    expect(duplicateOutcome).toEqual({
      status: 'already_saved',
      placeId: 'sosny',
    });
    expect(onAlreadySaved).toHaveBeenCalledWith('sosny', targetPlace);
    expect(result.current.isPlaceAlreadySaved('sosny')).toBe(true);
    expect(isAlreadySavedError(new Error('other'))).toBe(false);
  });
});
