import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { DEMO_RECOGNIZED_LINK, enableMocks, resetMockState } from '@/shared/api';

import {
  savedPlaceQueries,
  useDeletePlaceMutation,
  useMarkVisitMutation,
  useSavePlaceMutation,
  useSeedDemoPlacesMutation,
  useUpdatePlaceNoteMutation,
  useUpdateVisitExpectationMutation,
} from './saved-place-queries';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('saved-place-queries', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    resetMockState();
  });

  it('runs CRUD, visit marking, expectation update, and demo seed mutations', async () => {
    const wrapper = createWrapper();

    const { result: saveMutation } = renderHook(() => useSavePlaceMutation(), { wrapper });
    const created = await saveMutation.current.mutateAsync({
      placeId: 'zhuk-i-pchela',
      sourceUrl: DEMO_RECOGNIZED_LINK,
    });
    expect(created.place.id).toBe('zhuk-i-pchela');

    const { result: noteMutation } = renderHook(() => useUpdatePlaceNoteMutation(), {
      wrapper,
    });
    const withNote = await noteMutation.current.mutateAsync({
      placeId: 'zhuk-i-pchela',
      note: 'взять фильтр-кофе',
    });
    expect(withNote.note).toBe('взять фильтр-кофе');

    const { result: visitMutation } = renderHook(() => useMarkVisitMutation(), { wrapper });
    const visited = await visitMutation.current.mutateAsync({
      placeId: 'zhuk-i-pchela',
      verified: true,
    });
    expect(visited.visits).toHaveLength(1);

    const { result: expectationMutation } = renderHook(() => useUpdateVisitExpectationMutation(), {
      wrapper,
    });
    const answered = await expectationMutation.current.mutateAsync({
      placeId: 'zhuk-i-pchela',
      expectation: 'as_expected',
      comment: 'Супер',
    });
    expect(answered.visits[0]?.expectation).toBe('as_expected');

    const { result: deleteMutation } = renderHook(() => useDeletePlaceMutation(), {
      wrapper,
    });
    await deleteMutation.current.mutateAsync('zhuk-i-pchela');

    const { result: seedMutation } = renderHook(() => useSeedDemoPlacesMutation(), {
      wrapper,
    });
    const seeded = await seedMutation.current.mutateAsync();
    expect(seeded).toHaveLength(8);

    const { result: listQuery } = renderHook(() => useQuery(savedPlaceQueries.list()), {
      wrapper,
    });
    await waitFor(() => {
      expect(listQuery.current.data).toHaveLength(8);
    });
  });
});
