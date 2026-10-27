import { QueryClient } from '@tanstack/react-query';

import { initPwa } from '@/app/pwa';
import {
  hydrateSavedPlacesQueryClient,
  setupQueryClientPersistence,
} from '@/features/offline-status';

export interface CreateAppQueryClientOptions {
  storage?: Storage | null | undefined;
  enablePersistence?: boolean | undefined;
}

export function createAppQueryClient(options: CreateAppQueryClientOptions = {}): QueryClient {
  const { storage, enablePersistence = true } = options;

  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 1000 * 60 * 60 * 24,
        retry: 1,
      },
    },
  });

  if (enablePersistence) {
    setupQueryClientPersistence(client, storage);
  }

  return client;
}

export const queryClient = createAppQueryClient();

initPwa();

export { hydrateSavedPlacesQueryClient, setupQueryClientPersistence };
