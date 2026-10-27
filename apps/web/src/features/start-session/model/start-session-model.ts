import { type QueryClient, QueryClientContext } from '@tanstack/react-query';
import { useCallback, useContext, useEffect, useState } from 'react';

import {
  createSession,
  getStoredSession,
  type Session,
  sessionQueries,
  setStoredSession,
} from '@/entities/session';

let inFlightSessionPromise: Promise<Session> | null = null;

function syncSessionToQueryClient(queryClient: QueryClient | undefined, session: Session): void {
  if (!queryClient) {
    return;
  }
  queryClient.setQueryData(sessionQueries.current().queryKey, session);
}

export async function ensureAnonymousSession(queryClient?: QueryClient): Promise<Session> {
  const existing = getStoredSession();
  if (existing) {
    syncSessionToQueryClient(queryClient, existing);
    return existing;
  }

  inFlightSessionPromise ??= createSession().finally(() => {
    inFlightSessionPromise = null;
  });

  const created = await inFlightSessionPromise;
  setStoredSession(created);
  syncSessionToQueryClient(queryClient, created);
  return created;
}

export interface UseStartSessionOptions {
  autoStart?: boolean | undefined;
}

export interface UseStartSessionResult {
  session: Session | null;
  isStarting: boolean;
  startSession: () => Promise<Session | null>;
}

export function useStartSession(options?: UseStartSessionOptions): UseStartSessionResult {
  const autoStart = options?.autoStart ?? true;
  const queryClient = useContext(QueryClientContext);

  const [session, setSession] = useState<Session | null>(() => getStoredSession());
  const [isStarting, setIsStarting] = useState<boolean>(false);

  const startSession = useCallback(async (): Promise<Session | null> => {
    const stored = getStoredSession();
    if (stored) {
      setSession(stored);
      syncSessionToQueryClient(queryClient, stored);
      return stored;
    }

    setIsStarting(true);
    try {
      const created = await ensureAnonymousSession(queryClient);
      setSession(created);
      return created;
    } catch {
      return null;
    } finally {
      setIsStarting(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (!autoStart) {
      return;
    }

    const stored = getStoredSession();
    if (stored) {
      syncSessionToQueryClient(queryClient, stored);
      return;
    }

    let active = true;
    void Promise.resolve()
      .then(() => {
        if (active) {
          setIsStarting(true);
        }
        return ensureAnonymousSession(queryClient);
      })
      .then((created) => {
        if (active) {
          setSession(created);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setIsStarting(false);
        }
      });

    return () => {
      active = false;
    };
  }, [autoStart, queryClient]);

  return {
    session,
    isStarting,
    startSession,
  };
}
