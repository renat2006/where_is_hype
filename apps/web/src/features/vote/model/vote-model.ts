import { QueryClient, QueryClientContext, useQueryClient } from '@tanstack/react-query';
import type { Shortlist, Vote } from '@where-is-hype/core';
import { upsertVote } from '@where-is-hype/core';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { getVoterId, shortlistQueries, submitShortlistVote } from '@/entities/shortlist';
import { type MockDbState, readMockState, writeMockState } from '@/shared/api';
import { track } from '@/shared/lib/analytics';

export const VOTER_NAME_STORAGE_KEY = 'where-is-hype:voter-name';
export const VOTE_ERROR_MESSAGE = 'Голос не ушёл. Ещё раз?';
export const MAX_VOTER_NAME_LENGTH = 80;

const EMPTY_VOTES: readonly Vote[] = [];

const storedVoterNameSchema = z.string();

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});

export function normalizeVoterName(rawName: string | null | undefined): string | undefined {
  if (typeof rawName !== 'string') {
    return undefined;
  }
  const trimmed = rawName.trim().slice(0, MAX_VOTER_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getStoredVoterName(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const raw = window.localStorage.getItem(VOTER_NAME_STORAGE_KEY);
    const parsed = storedVoterNameSchema.safeParse(raw);
    if (!parsed.success) {
      return '';
    }
    return parsed.data.trim().slice(0, MAX_VOTER_NAME_LENGTH);
  } catch {
    return '';
  }
}

export function setStoredVoterName(name: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const normalized = normalizeVoterName(name);
    if (normalized) {
      window.localStorage.setItem(VOTER_NAME_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(VOTER_NAME_STORAGE_KEY);
    }
  } catch {
    // Ignore storage write errors in restricted environments
  }
}

export function findVoterVote(
  votes: readonly Vote[] | undefined,
  voterId: string,
): Vote | undefined {
  if (!votes || !voterId) {
    return undefined;
  }

  let matched: Vote | undefined;
  for (const vote of votes) {
    if (vote.voterId === voterId) {
      matched = vote;
    }
  }
  return matched;
}

export function getVoterPlaceIds(votes: readonly Vote[] | undefined, voterId: string): string[] {
  const existing = findVoterVote(votes, voterId);
  if (!existing) {
    return [];
  }
  return Array.from(new Set(existing.placeIds));
}

export function isPlaceVotedByMe(
  votes: readonly Vote[] | undefined,
  voterId: string,
  placeId: string,
): boolean {
  return getVoterPlaceIds(votes, voterId).includes(placeId);
}

export function toggleVotedPlaceIds(currentPlaceIds: readonly string[], placeId: string): string[] {
  const unique = Array.from(new Set(currentPlaceIds));
  if (unique.includes(placeId)) {
    return unique.filter((id) => id !== placeId);
  }
  return [...unique, placeId];
}

export function countActiveVoters(votes: readonly Vote[] | undefined): number {
  if (!votes) {
    return 0;
  }

  const latestByVoter = new Map<string, Vote>();
  for (const vote of votes) {
    latestByVoter.set(vote.voterId, vote);
  }

  let active = 0;
  for (const vote of latestByVoter.values()) {
    if (vote.placeIds.length > 0) {
      active += 1;
    }
  }
  return active;
}

export function isShortlistExpired(
  shortlist: Pick<Shortlist, 'expiresAt'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!shortlist) {
    return false;
  }
  const expiresMs = new Date(shortlist.expiresAt).getTime();
  if (Number.isNaN(expiresMs)) {
    return false;
  }
  return expiresMs <= now.getTime();
}

function syncShortlistVotesToMockDb(
  token: string,
  updatedShortlist: Shortlist,
): MockDbState | null {
  try {
    const db = readMockState();
    const hasShared = Boolean(db.sharedShortlists[token]);
    const isCurrent = db.shortlist?.token === token;
    if (!hasShared && !isCurrent) {
      return null;
    }

    const previousSnapshot: MockDbState = {
      ...db,
      shortlist: db.shortlist ? { ...db.shortlist, votes: [...db.shortlist.votes] } : null,
      sharedShortlists: { ...db.sharedShortlists },
    };

    if (hasShared) {
      db.sharedShortlists[token] = updatedShortlist;
    }
    if (isCurrent && db.shortlist) {
      db.shortlist = {
        ...db.shortlist,
        votes: updatedShortlist.votes,
      };
    }

    writeMockState(db);
    return previousSnapshot;
  } catch {
    return null;
  }
}

export interface UseFriendVoteOptions {
  token: string;
  shortlist?: Shortlist | null | undefined;
  voterId?: string | undefined;
  now?: Date | undefined;
  onVoted?: ((shortlist: Shortlist, placeIds: string[]) => void) | undefined;
}

export function useFriendVote({
  token,
  shortlist,
  voterId: voterIdProp,
  now,
  onVoted,
}: UseFriendVoteOptions) {
  const contextQueryClient = useContext(QueryClientContext);
  const activeQueryClient = contextQueryClient ?? fallbackQueryClient;
  const queryClient = useQueryClient(activeQueryClient);

  const resolvedVoterId = useMemo(() => voterIdProp ?? getVoterId(), [voterIdProp]);

  const [editedNameState, setEditedNameState] = useState<{
    token: string;
    value: string;
  } | null>(null);
  const [optimisticState, setOptimisticState] = useState<{
    token: string;
    votes: Vote[];
  } | null>(null);
  const [statusState, setStatusState] = useState<{
    token: string;
    pendingPlaceId: string | null;
    failedPlaceId: string | null;
    voteError: string | null;
  }>({
    token,
    pendingPlaceId: null,
    failedPlaceId: null,
    voteError: null,
  });

  const voterName = useMemo(() => {
    if (editedNameState?.token === token) {
      return editedNameState.value;
    }
    const fromVote = findVoterVote(shortlist?.votes, resolvedVoterId)?.name;
    return fromVote ?? getStoredVoterName();
  }, [editedNameState, resolvedVoterId, shortlist?.votes, token]);

  const effectiveVotes = useMemo(() => {
    if (optimisticState?.token === token) {
      return optimisticState.votes;
    }
    return shortlist?.votes ?? EMPTY_VOTES;
  }, [optimisticState, shortlist?.votes, token]);

  const voterNameRef = useRef(voterName);
  const latestVotesRef = useRef<readonly Vote[]>(effectiveVotes);

  useEffect(() => {
    voterNameRef.current = voterName;
  }, [voterName]);

  useEffect(() => {
    latestVotesRef.current = effectiveVotes;
  }, [effectiveVotes]);

  const selectedPlaceIds = useMemo(
    () => getVoterPlaceIds(effectiveVotes, resolvedVoterId),
    [effectiveVotes, resolvedVoterId],
  );

  const isExpired = isShortlistExpired(shortlist, now);

  const pendingPlaceId = statusState.token === token ? statusState.pendingPlaceId : null;
  const failedPlaceId = statusState.token === token ? statusState.failedPlaceId : null;
  const voteError = statusState.token === token ? statusState.voteError : null;

  const applyOptimisticShortlist = useCallback(
    (
      nextVotes: Vote[],
    ): {
      prevShared: Shortlist | undefined;
      prevMine: Shortlist | undefined;
      prevDb: MockDbState | null;
    } => {
      const sharedKey = shortlistQueries.byToken(token).queryKey;
      const mineKey = shortlistQueries.mine().queryKey;
      const prevShared = queryClient.getQueryData<Shortlist>(sharedKey);
      const prevMine = queryClient.getQueryData<Shortlist>(mineKey);

      const baseShortlist = prevShared ?? shortlist ?? undefined;
      let prevDb: MockDbState | null = null;

      if (baseShortlist) {
        const nextShortlist: Shortlist = {
          ...baseShortlist,
          votes: nextVotes,
        };
        queryClient.setQueryData<Shortlist>(sharedKey, nextShortlist);
        if (prevMine?.token === token) {
          queryClient.setQueryData<Shortlist>(mineKey, {
            ...prevMine,
            votes: nextVotes,
          });
        }
        prevDb = syncShortlistVotesToMockDb(token, nextShortlist);
      }

      setOptimisticState({ token, votes: nextVotes });
      latestVotesRef.current = nextVotes;

      return { prevShared, prevMine, prevDb };
    },
    [queryClient, shortlist, token],
  );

  const setVoterName = useCallback(
    (nextName: string) => {
      const sliced = nextName.slice(0, MAX_VOTER_NAME_LENGTH);
      setEditedNameState({ token, value: sliced });
      voterNameRef.current = sliced;
      setStoredVoterName(sliced);

      const currentIds = getVoterPlaceIds(latestVotesRef.current, resolvedVoterId);
      if (currentIds.length > 0 && !isExpired) {
        const normalizedName = normalizeVoterName(sliced);
        const nextVote: Vote = {
          voterId: resolvedVoterId,
          ...(normalizedName !== undefined ? { name: normalizedName } : {}),
          placeIds: currentIds,
        };
        const nextVotes = upsertVote(latestVotesRef.current, nextVote);
        applyOptimisticShortlist(nextVotes);
      }
    },
    [applyOptimisticShortlist, isExpired, resolvedVoterId, token],
  );

  const commitVoterName = useCallback(
    async (overrideName?: string): Promise<Shortlist | null> => {
      if (isExpired || !token) {
        return null;
      }

      const rawName = overrideName ?? voterNameRef.current;
      const normalizedName = normalizeVoterName(rawName);
      setStoredVoterName(rawName);

      const currentIds = getVoterPlaceIds(latestVotesRef.current, resolvedVoterId);
      if (currentIds.length === 0) {
        return null;
      }

      const nextVote: Vote = {
        voterId: resolvedVoterId,
        ...(normalizedName !== undefined ? { name: normalizedName } : {}),
        placeIds: currentIds,
      };
      const nextVotes = upsertVote(latestVotesRef.current, nextVote);
      const snapshot = applyOptimisticShortlist(nextVotes);

      try {
        const updated = await submitShortlistVote({
          token,
          voterId: resolvedVoterId,
          ...(normalizedName !== undefined ? { name: normalizedName } : {}),
          placeIds: currentIds,
        });
        setOptimisticState({ token, votes: updated.votes });
        latestVotesRef.current = updated.votes;
        queryClient.setQueryData(shortlistQueries.byToken(token).queryKey, updated);
        const mine = queryClient.getQueryData<Shortlist>(shortlistQueries.mine().queryKey);
        if (mine?.token === token) {
          queryClient.setQueryData(shortlistQueries.mine().queryKey, updated);
        }
        await queryClient.invalidateQueries({ queryKey: shortlistQueries.all() });
        onVoted?.(updated, currentIds);
        return updated;
      } catch {
        if (snapshot.prevShared) {
          queryClient.setQueryData(shortlistQueries.byToken(token).queryKey, snapshot.prevShared);
        }
        if (snapshot.prevMine) {
          queryClient.setQueryData(shortlistQueries.mine().queryKey, snapshot.prevMine);
        }
        if (snapshot.prevDb) {
          writeMockState(snapshot.prevDb);
        }
        setOptimisticState(null);
        return null;
      }
    },
    [applyOptimisticShortlist, isExpired, onVoted, queryClient, resolvedVoterId, token],
  );

  const togglePlaceVote = useCallback(
    async (placeId: string): Promise<Shortlist | null> => {
      if (isExpired || !token || !placeId) {
        return null;
      }

      const validIds = shortlist ? new Set(shortlist.places.map((p) => p.id)) : null;
      if (validIds && !validIds.has(placeId)) {
        return null;
      }

      const currentIds = getVoterPlaceIds(latestVotesRef.current, resolvedVoterId);
      const nextPlaceIds = toggleVotedPlaceIds(currentIds, placeId).filter((id) =>
        validIds ? validIds.has(id) : true,
      );
      const normalizedName = normalizeVoterName(voterNameRef.current);

      const nextVote: Vote = {
        voterId: resolvedVoterId,
        ...(normalizedName !== undefined ? { name: normalizedName } : {}),
        placeIds: nextPlaceIds,
      };
      const nextVotes = upsertVote(latestVotesRef.current, nextVote);

      setStatusState({
        token,
        pendingPlaceId: placeId,
        failedPlaceId: null,
        voteError: null,
      });

      const snapshot = applyOptimisticShortlist(nextVotes);

      track('friend_voted', {
        token,
        placeId,
        selected: nextPlaceIds.includes(placeId),
        placeIdsCount: nextPlaceIds.length,
        hasName: normalizedName !== undefined,
      });

      try {
        const updated = await submitShortlistVote({
          token,
          voterId: resolvedVoterId,
          ...(normalizedName !== undefined ? { name: normalizedName } : {}),
          placeIds: nextPlaceIds,
        });

        setOptimisticState({ token, votes: updated.votes });
        latestVotesRef.current = updated.votes;
        queryClient.setQueryData(shortlistQueries.byToken(token).queryKey, updated);

        const mine = queryClient.getQueryData<Shortlist>(shortlistQueries.mine().queryKey);
        if (mine?.token === token) {
          queryClient.setQueryData(shortlistQueries.mine().queryKey, updated);
        }

        await queryClient.invalidateQueries({ queryKey: shortlistQueries.all() });
        setStatusState((prev) =>
          prev.token === token && prev.pendingPlaceId === placeId
            ? { ...prev, pendingPlaceId: null }
            : prev,
        );
        onVoted?.(updated, nextPlaceIds);
        return updated;
      } catch {
        if (snapshot.prevShared) {
          queryClient.setQueryData(shortlistQueries.byToken(token).queryKey, snapshot.prevShared);
        }
        if (snapshot.prevMine) {
          queryClient.setQueryData(shortlistQueries.mine().queryKey, snapshot.prevMine);
        }
        if (snapshot.prevDb) {
          writeMockState(snapshot.prevDb);
        }
        setOptimisticState(null);
        setStatusState({
          token,
          pendingPlaceId: null,
          failedPlaceId: placeId,
          voteError: VOTE_ERROR_MESSAGE,
        });
        return null;
      }
    },
    [applyOptimisticShortlist, isExpired, onVoted, queryClient, resolvedVoterId, shortlist, token],
  );

  return {
    voterId: resolvedVoterId,
    voterName,
    votes: effectiveVotes,
    selectedPlaceIds,
    activeVotersCount: countActiveVoters(effectiveVotes),
    isExpired,
    pendingPlaceId,
    failedPlaceId,
    voteError,
    setVoterName,
    commitVoterName,
    togglePlaceVote,
  };
}
