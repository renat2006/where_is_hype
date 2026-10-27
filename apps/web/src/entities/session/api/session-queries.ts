import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { Session } from '@/shared/api';
import { apiGet, apiPost, SESSION_STORAGE_KEY, sessionSchema } from '@/shared/api';

export async function getSession(init?: RequestInit): Promise<Session | null> {
  return apiGet('/me', sessionSchema.nullable(), init);
}

export async function createSession(init?: RequestInit): Promise<Session> {
  const session = await apiPost('/me', sessionSchema, undefined, init);
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage errors
  }
  return session;
}

export const startSession = createSession;

export const sessionQueries = {
  all: () => ['session'] as const,
  current: () =>
    queryOptions({
      queryKey: ['session', 'current'] as const,
      queryFn: ({ signal }) => getSession({ signal }),
    }),
  me: () =>
    queryOptions({
      queryKey: ['session', 'current'] as const,
      queryFn: ({ signal }) => getSession({ signal }),
    }),
};

export function useCreateSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => createSession(),
    onSuccess: async (session) => {
      queryClient.setQueryData(['session', 'current'], session);
      await queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
    },
  });
}

export const useStartSessionMutation = useCreateSessionMutation;
