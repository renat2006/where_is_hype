import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Shortlist } from '@where-is-hype/core';
import { shortlistSchema } from '@where-is-hype/core';

import type { SubmitVoteInput, UpdateShortlistInput } from '@/shared/api';
import { apiGet, apiPost, apiPut, getOrCreateBrowserVoterId } from '@/shared/api';

export async function getMyShortlist(init?: RequestInit): Promise<Shortlist> {
  return apiGet('/me/shortlist', shortlistSchema, init);
}

export async function updateMyShortlist(
  input: UpdateShortlistInput | readonly string[],
  init?: RequestInit,
): Promise<Shortlist> {
  const placeIds = 'placeIds' in input ? input.placeIds : [...input];
  return apiPut('/me/shortlist', shortlistSchema, { placeIds }, init);
}

export async function shareMyShortlist(init?: RequestInit): Promise<Shortlist> {
  return apiPost('/me/shortlist/share', shortlistSchema, undefined, init);
}

export async function getSharedShortlist(token: string, init?: RequestInit): Promise<Shortlist> {
  return apiGet(`/s/${encodeURIComponent(token)}`, shortlistSchema, init);
}

export async function submitShortlistVote(
  input: SubmitVoteInput,
  init?: RequestInit,
): Promise<Shortlist> {
  const { token, voterId, name, placeIds } = input;
  const resolvedVoterId = voterId ?? getOrCreateBrowserVoterId();
  return apiPost(
    `/s/${encodeURIComponent(token)}/votes`,
    shortlistSchema,
    {
      voterId: resolvedVoterId,
      ...(name !== undefined ? { name } : {}),
      placeIds,
    },
    init,
  );
}

export const shortlistQueries = {
  all: () => ['shortlist'] as const,
  mine: () =>
    queryOptions({
      queryKey: ['shortlist', 'mine'] as const,
      queryFn: ({ signal }) => getMyShortlist({ signal }),
    }),
  current: () =>
    queryOptions({
      queryKey: ['shortlist', 'mine'] as const,
      queryFn: ({ signal }) => getMyShortlist({ signal }),
    }),
  byToken: (token: string) =>
    queryOptions({
      queryKey: ['shortlist', 'shared', token] as const,
      queryFn: ({ signal }) => getSharedShortlist(token, { signal }),
      enabled: token.length > 0,
    }),
  shared: (token: string) =>
    queryOptions({
      queryKey: ['shortlist', 'shared', token] as const,
      queryFn: ({ signal }) => getSharedShortlist(token, { signal }),
      enabled: token.length > 0,
    }),
};

export function useUpdateShortlistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateShortlistInput | readonly string[]) => updateMyShortlist(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shortlistQueries.all() });
    },
  });
}

export function useShareShortlistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => shareMyShortlist(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shortlistQueries.all() });
    },
  });
}

export function useSubmitVoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitVoteInput) => submitShortlistVote(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shortlistQueries.all() });
    },
  });
}

export const useVoteShortlistMutation = useSubmitVoteMutation;
