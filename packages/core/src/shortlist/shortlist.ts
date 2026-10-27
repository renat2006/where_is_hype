import { z } from 'zod';

import { placeSchema } from '../place';

export const SHORTLIST_MAX_PLACES = 5;
export const SHORTLIST_TTL_DAYS = 7;
export const SHORTLIST_TTL_MS = SHORTLIST_TTL_DAYS * 24 * 60 * 60 * 1000;

export const voteSchema = z.object({
  voterId: z.string().min(1),
  name: z.string().optional(),
  placeIds: z.array(z.string().min(1)),
});

export const shortlistSchema = z.object({
  token: z.string().min(1),
  places: z.array(placeSchema).max(SHORTLIST_MAX_PLACES),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  votes: z.array(voteSchema),
});

export type Vote = z.infer<typeof voteSchema>;
export type Shortlist = z.infer<typeof shortlistSchema>;

export function createShortlistExpiresAt(createdAt: Date | string): string {
  const startMs =
    typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime();
  return new Date(startMs + SHORTLIST_TTL_MS).toISOString();
}

export function upsertVote(votes: readonly Vote[], nextVote: Vote): Vote[] {
  const index = votes.findIndex((v) => v.voterId === nextVote.voterId);
  if (index === -1) {
    return [...votes, nextVote];
  }

  return votes.map((v, i) => (i === index ? nextVote : v));
}

export function tally(votes: readonly Vote[]): Record<string, number> {
  const latestByVoter = new Map<string, Vote>();
  for (const vote of votes) {
    latestByVoter.set(vote.voterId, vote);
  }

  const counts: Record<string, number> = {};
  for (const vote of latestByVoter.values()) {
    const uniquePlaceIds = new Set(vote.placeIds);
    for (const placeId of uniquePlaceIds) {
      counts[placeId] = (counts[placeId] ?? 0) + 1;
    }
  }

  return counts;
}
