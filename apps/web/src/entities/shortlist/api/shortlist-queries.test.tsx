import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { enableMocks, resetMockState } from '@/shared/api';

import {
  shortlistQueries,
  useShareShortlistMutation,
  useSubmitVoteMutation,
  useUpdateShortlistMutation,
} from './shortlist-queries';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('shortlist-queries', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    resetMockState();
  });

  it('updates shortlist, shares token, and submits votes via TanStack Query', async () => {
    const wrapper = createWrapper();

    const { result: updateMutation } = renderHook(() => useUpdateShortlistMutation(), {
      wrapper,
    });
    const updated = await updateMutation.current.mutateAsync(['sosny', 'zhuk-i-pchela']);
    expect(updated.places).toHaveLength(2);

    const { result: shareMutation } = renderHook(() => useShareShortlistMutation(), {
      wrapper,
    });
    const shared = await shareMutation.current.mutateAsync();
    expect(shared.token).toBeTruthy();

    const { result: voteMutation } = renderHook(() => useSubmitVoteMutation(), {
      wrapper,
    });
    const voted = await voteMutation.current.mutateAsync({
      token: shared.token,
      name: 'Друг',
      placeIds: ['sosny'],
    });
    expect(voted.votes).toHaveLength(1);

    const { result: byTokenQuery } = renderHook(
      () => useQuery(shortlistQueries.byToken(shared.token)),
      { wrapper },
    );
    await waitFor(() => {
      expect(byTokenQuery.current.data?.votes).toHaveLength(1);
    });
  });
});
