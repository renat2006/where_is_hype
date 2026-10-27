import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { DEMO_RECOGNIZED_LINK, enableMocks, resetMockState } from '@/shared/api';

import { placeQueries, useReportPlaceMutation, useResolveLinkMutation } from './place-queries';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('place-queries', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    resetMockState();
  });

  it('fetches place search suggestions and resolves links via TanStack Query', async () => {
    const wrapper = createWrapper();

    const { result: searchResult } = renderHook(() => useQuery(placeQueries.search('Сосны')), {
      wrapper,
    });

    await waitFor(() => {
      expect(searchResult.current.isSuccess).toBe(true);
    });
    expect(searchResult.current.data?.some((place) => place.id === 'sosny')).toBe(true);

    const { result: resolveMutation } = renderHook(() => useResolveLinkMutation(), {
      wrapper,
    });
    const candidates = await resolveMutation.current.mutateAsync(DEMO_RECOGNIZED_LINK);
    expect(candidates[0]?.place.id).toBe('zhuk-i-pchela');

    const { result: reportMutation } = renderHook(() => useReportPlaceMutation(), {
      wrapper,
    });
    const report = await reportMutation.current.mutateAsync({
      query: 'Тайный бар',
    });
    expect(report.query).toBe('Тайный бар');
  });
});
