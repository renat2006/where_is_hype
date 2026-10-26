import { queryOptions } from '@tanstack/react-query';
import { placeSchema } from '@where-is-hype/core';
import { z } from 'zod';

import { apiGet } from '@/shared/api';

export const placeQueries = {
  all: () => ['places'] as const,
  list: () =>
    queryOptions({
      queryKey: [...placeQueries.all(), 'list'],
      queryFn: ({ signal }) => apiGet('/places', z.array(placeSchema), { signal }),
    }),
};
