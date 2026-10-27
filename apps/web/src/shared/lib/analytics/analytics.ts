import { z } from 'zod';

import { env } from '@/shared/config';

export const ANALYTICS_EVENTS = [
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
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsPrimitive = string | number | boolean | null | undefined;
export type AnalyticsProps = Record<string, AnalyticsPrimitive>;

export interface AnalyticsEventPropsMap {
  link_pasted: AnalyticsProps;
  candidates_shown: AnalyticsProps;
  place_saved: {
    source?: 'link' | 'name';
    via?: 'link' | 'name';
    [key: string]: AnalyticsPrimitive;
  };
  map_opened: AnalyticsProps;
  filter_applied: AnalyticsProps;
  card_opened: AnalyticsProps;
  route_clicked: AnalyticsProps;
  shortlist_shared: AnalyticsProps;
  friend_page_opened: AnalyticsProps;
  friend_voted: AnalyticsProps;
  visit_marked: {
    verified?: boolean;
    status?: 'verified' | 'not';
    [key: string]: AnalyticsPrimitive;
  };
  expectation_answered: {
    expectation?: 'better' | 'as_expected' | 'worse';
    [key: string]: AnalyticsPrimitive;
  };
}

export interface AnalyticsEventPayload<E extends AnalyticsEventName = AnalyticsEventName> {
  event: E;
  anonymousId: string;
  timestamp: string;
  props?: AnalyticsEventPropsMap[E];
}

export const ANON_ID_STORAGE_KEY = 'where-is-hype:anon-id';

const anonymousIdSchema = z.string().min(1);

function createFallbackId(): string {
  return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getAnonymousId(): string {
  try {
    const existing = window.localStorage.getItem(ANON_ID_STORAGE_KEY);
    const parsed = anonymousIdSchema.safeParse(existing);
    if (parsed.success) {
      return parsed.data;
    }

    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : createFallbackId();

    window.localStorage.setItem(ANON_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return createFallbackId();
  }
}

export function track<E extends AnalyticsEventName>(
  event: E,
  props?: AnalyticsEventPropsMap[E],
): AnalyticsEventPayload<E> {
  const payload: AnalyticsEventPayload<E> = {
    event,
    anonymousId: getAnonymousId(),
    timestamp: new Date().toISOString(),
    ...(props !== undefined ? { props } : {}),
  };

  if (import.meta.env.DEV) {
    console.warn('[analytics]', payload);
  }

  try {
    void fetch(`${env.apiUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Ignore synchronous fetch errors in offline or test environments
  }

  return payload;
}
