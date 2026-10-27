import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  getStoredSession,
  hasStoredSession,
  sessionQueries,
  setStoredSession,
} from '@/entities/session';
import { enableMocks, resetMockState } from '@/shared/api';

import { ensureAnonymousSession, useStartSession } from './start-session-model';

describe('start-session-model', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    resetMockState();
  });

  it('creates an anonymous session via POST /me on first launch and updates QueryClient cache', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    expect(hasStoredSession()).toBe(false);

    const { result } = renderHook(() => useStartSession(), { wrapper });

    await waitFor(() => {
      expect(result.current.session).not.toBeNull();
    });

    expect(result.current.session?.id).toMatch(/^usr-/);
    expect(getStoredSession()?.id).toBe(result.current.session?.id);
    expect(queryClient.getQueryData(sessionQueries.current().queryKey)).toEqual(
      result.current.session,
    );
  });

  it('reuses existing stored session without overwriting it', async () => {
    const existing = { id: 'usr-existing', createdAt: '2026-10-27T09:00:00.000Z' };
    setStoredSession(existing);

    const resolved = await ensureAnonymousSession();
    expect(resolved).toEqual(existing);
  });
});
