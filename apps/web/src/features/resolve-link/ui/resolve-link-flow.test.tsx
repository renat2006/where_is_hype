import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  DEMO_RECOGNIZED_LINK,
  DEMO_UNKNOWN_LINK,
  enableMocks,
  readMockState,
  resetMockState,
  setMockRealisticDelays,
} from '@/shared/api';

import { formatShortUrl, pluralizeCandidatesNoun, useResolveLinkFlow } from './resolve-link-flow';

describe('resolve-link-flow', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    setMockRealisticDelays(null);
    resetMockState();
    vi.restoreAllMocks();
  });

  it('formats short URLs and pluralizes candidate count', () => {
    expect(formatShortUrl('https://www.vt.tiktok.com/ZS8kQ2pLm/')).toBe('vt.tiktok.com/ZS8kQ2pLm');
    expect(formatShortUrl('   ')).toBe('');
    expect(pluralizeCandidatesNoun(1)).toBe('место');
    expect(pluralizeCandidatesNoun(2)).toBe('места');
    expect(pluralizeCandidatesNoun(3)).toBe('места');
    expect(pluralizeCandidatesNoun(5)).toBe('мест');
  });

  it('resolves recognized link, tracks link_pasted and candidates_shown, and caps at 3 candidates', async () => {
    const onResolvedCandidates = vi.fn();
    const onUnrecognized = vi.fn();

    const { result } = renderHook(() =>
      useResolveLinkFlow({
        onResolvedCandidates,
        onUnrecognized,
      }),
    );

    await act(async () => {
      await result.current.startResolve(DEMO_RECOGNIZED_LINK);
    });

    expect(onResolvedCandidates).toHaveBeenCalledTimes(1);
    expect(onUnrecognized).not.toHaveBeenCalled();
    expect(result.current.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.current.candidates.length).toBeLessThanOrEqual(3);

    await waitFor(() => {
      const db = readMockState();
      expect(db.events.some((ev) => ev.event === 'link_pasted')).toBe(true);
      expect(db.events.some((ev) => ev.event === 'candidates_shown')).toBe(true);
    });
  });

  it('invokes onUnrecognized when link returns 0 candidates', async () => {
    const onResolvedCandidates = vi.fn();
    const onUnrecognized = vi.fn();

    const { result } = renderHook(() =>
      useResolveLinkFlow({
        onResolvedCandidates,
        onUnrecognized,
      }),
    );

    await act(async () => {
      await result.current.startResolve(DEMO_UNKNOWN_LINK);
    });

    expect(onResolvedCandidates).not.toHaveBeenCalled();
    expect(onUnrecognized).toHaveBeenCalledWith(DEMO_UNKNOWN_LINK);
    expect(result.current.candidates).toEqual([]);
  });

  it('sets isSlow when resolution exceeds slowThresholdMs', async () => {
    setMockRealisticDelays(true);

    const { result } = renderHook(() =>
      useResolveLinkFlow({
        slowThresholdMs: 20,
      }),
    );

    act(() => {
      void result.current.startResolve(DEMO_RECOGNIZED_LINK);
    });

    await waitFor(() => {
      expect(result.current.isSlow).toBe(true);
    });

    act(() => {
      result.current.cancelResolve();
    });
    expect(result.current.isResolving).toBe(false);
  });
});
