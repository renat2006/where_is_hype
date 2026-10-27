import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { enableMocks, resetMockState } from '@/shared/api';

import { sessionQueries, useCreateSessionMutation } from './session-queries';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('session-queries', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    resetMockState();
  });

  it('creates an anonymous session and updates query cache', async () => {
    const wrapper = createWrapper();

    const { result: sessionQuery } = renderHook(() => useQuery(sessionQueries.current()), {
      wrapper,
    });
    await waitFor(() => {
      expect(sessionQuery.current.isSuccess).toBe(true);
    });
    expect(sessionQuery.current.data).toBeNull();

    const { result: createMutation } = renderHook(() => useCreateSessionMutation(), {
      wrapper,
    });
    const created = await createMutation.current.mutateAsync();
    expect(created.id).toMatch(/^usr-/);

    await waitFor(() => {
      expect(sessionQuery.current.data?.id).toBe(created.id);
    });
  });
});
