import type { Candidate } from '@where-is-hype/core';
import { detectPlatform } from '@where-is-hype/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { resolvePlaceLink } from '@/entities/place';
import { env } from '@/shared/config';
import { track } from '@/shared/lib/analytics';

export const MAX_CANDIDATES = 3;
export const SLOW_RESOLVE_THRESHOLD_MS = 5_000;
export const STEP_2_DELAY_MS = 400;
export const STEP_3_DELAY_MS = 900;

export const RESOLVE_LOADING_STEPS = [
  { step: 1, indexLabel: '1/3', label: 'Читаем ссылку' },
  { step: 2, indexLabel: '2/3', label: 'Ищем адрес в описании' },
  { step: 3, indexLabel: '3/3', label: 'Сверяем с базой' },
] as const;

export function formatShortUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

export function pluralizeCandidatesNoun(count: number): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;

  if (mod100 >= 11 && mod100 <= 19) {
    return 'мест';
  }
  if (mod10 === 1) {
    return 'место';
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return 'места';
  }
  return 'мест';
}

export function isDemoLinksEnabled(override?: boolean): boolean {
  if (override !== undefined) {
    return override;
  }
  if (import.meta.env.VITE_API_MOCKS === 'true') {
    return true;
  }
  if (import.meta.env.VITE_API_MOCKS === 'false') {
    return false;
  }
  return env.apiMocks || Boolean(import.meta.env.VITEST) || import.meta.env.MODE === 'test';
}

export interface UseResolveLinkFlowOptions {
  slowThresholdMs?: number | undefined;
  onResolvedCandidates?: ((candidates: Candidate[], url: string) => void) | undefined;
  onUnrecognized?: ((url: string) => void) | undefined;
}

export function useResolveLinkFlow(options?: UseResolveLinkFlowOptions) {
  const slowThresholdMs = options?.slowThresholdMs ?? SLOW_RESOLVE_THRESHOLD_MS;
  const onResolvedCandidates = options?.onResolvedCandidates;
  const onUnrecognized = options?.onUnrecognized;

  const [isResolving, setIsResolving] = useState(false);
  const [loadingStep, setLoadingStep] = useState<1 | 2 | 3>(1);
  const [isSlow, setIsSlow] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<number[]>([]);
  const lastTrackedUrlRef = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    for (const timerId of timersRef.current) {
      window.clearTimeout(timerId);
    }
    timersRef.current = [];
  }, []);

  const cancelResolve = useCallback(() => {
    clearTimers();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsResolving(false);
    setIsSlow(false);
    setLoadingStep(1);
  }, [clearTimers]);

  useEffect(() => {
    return () => {
      clearTimers();
      abortRef.current?.abort();
    };
  }, [clearTimers]);

  const trackLinkPastedOnce = useCallback((rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed || lastTrackedUrlRef.current === trimmed) {
      return;
    }
    lastTrackedUrlRef.current = trimmed;
    track('link_pasted', {
      url: trimmed,
      platform: detectPlatform(trimmed),
    });
  }, []);

  const startResolve = useCallback(
    async (rawUrl: string): Promise<Candidate[]> => {
      const trimmed = rawUrl.trim();
      if (!trimmed) {
        return [];
      }

      cancelResolve();
      trackLinkPastedOnce(trimmed);

      const controller = new AbortController();
      abortRef.current = controller;

      setIsResolving(true);
      setLoadingStep(1);
      setIsSlow(false);

      const step2Timer = window.setTimeout(() => {
        setLoadingStep(2);
      }, STEP_2_DELAY_MS);

      const step3Timer = window.setTimeout(() => {
        setLoadingStep(3);
      }, STEP_3_DELAY_MS);

      const slowTimer = window.setTimeout(() => {
        setIsSlow(true);
      }, slowThresholdMs);

      timersRef.current = [step2Timer, step3Timer, slowTimer];

      try {
        const result = await resolvePlaceLink({ url: trimmed }, { signal: controller.signal });
        if (controller.signal.aborted) {
          return [];
        }

        clearTimers();
        setIsResolving(false);
        setIsSlow(false);

        const limited = result.slice(0, MAX_CANDIDATES);
        setCandidates(limited);

        if (limited.length > 0) {
          track('candidates_shown', {
            count: limited.length,
            url: trimmed,
          });
          onResolvedCandidates?.(limited, trimmed);
        } else {
          onUnrecognized?.(trimmed);
        }

        return limited;
      } catch {
        if (controller.signal.aborted) {
          return [];
        }

        clearTimers();
        setIsResolving(false);
        setIsSlow(false);
        setCandidates([]);
        onUnrecognized?.(trimmed);
        return [];
      }
    },
    [
      cancelResolve,
      clearTimers,
      onResolvedCandidates,
      onUnrecognized,
      slowThresholdMs,
      trackLinkPastedOnce,
    ],
  );

  return {
    isResolving,
    loadingStep,
    isSlow,
    candidates,
    setCandidates,
    startResolve,
    cancelResolve,
    trackLinkPastedOnce,
  };
}
