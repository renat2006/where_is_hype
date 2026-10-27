import type { Vote } from '@where-is-hype/core';

import { type AvatarPerson, Avatars } from '@/shared/ui/avatars';

export interface VotersAvatarsProps {
  votes?: readonly Vote[] | undefined;
  voters?: readonly (string | AvatarPerson | Vote)[] | undefined;
  items?: readonly (string | AvatarPerson)[] | undefined;
  placeId?: string | undefined;
  maxVisible?: number | undefined;
  totalCount?: number | undefined;
  showLabel?: boolean | undefined;
  labelSuffix?: string | undefined;
  size?: 'sm' | 'md' | undefined;
  anonymousName?: string | undefined;
  showWhenEmpty?: boolean | undefined;
  className?: string | undefined;
}

function isVoteObject(item: string | AvatarPerson | Vote): item is Vote {
  return typeof item === 'object' && 'voterId' in item && 'placeIds' in item;
}

function extractAvatarPersonsFromVotes(
  votes: readonly Vote[],
  placeId: string | undefined,
  anonymousName: string,
): AvatarPerson[] {
  const latestByVoter = new Map<string, Vote>();
  for (const vote of votes) {
    latestByVoter.set(vote.voterId, vote);
  }

  const result: AvatarPerson[] = [];
  for (const vote of latestByVoter.values()) {
    const matches =
      placeId !== undefined ? vote.placeIds.includes(placeId) : vote.placeIds.length > 0;
    if (matches) {
      const trimmedName = vote.name?.trim();
      result.push({
        id: vote.voterId,
        name: trimmedName && trimmedName.length > 0 ? trimmedName : anonymousName,
      });
    }
  }

  return result;
}

function normalizeVoterItems(
  props: Pick<VotersAvatarsProps, 'votes' | 'voters' | 'items' | 'placeId'>,
  anonymousName: string,
): (string | AvatarPerson)[] {
  if (props.items) {
    return [...props.items];
  }

  if (props.votes) {
    return extractAvatarPersonsFromVotes(props.votes, props.placeId, anonymousName);
  }

  if (props.voters) {
    const voteObjects = props.voters.filter(isVoteObject);
    if (voteObjects.length === props.voters.length && voteObjects.length > 0) {
      return extractAvatarPersonsFromVotes(voteObjects, props.placeId, anonymousName);
    }

    return props.voters.map((voter, index) => {
      if (typeof voter === 'string') {
        return voter.trim() || anonymousName;
      }
      if (isVoteObject(voter)) {
        const trimmedName = voter.name?.trim();
        return {
          id: voter.voterId,
          name: trimmedName && trimmedName.length > 0 ? trimmedName : anonymousName,
        };
      }
      const trimmedName = voter.name.trim();
      return {
        id: voter.id ?? `${trimmedName || anonymousName}-${String(index)}`,
        name: trimmedName || anonymousName,
      };
    });
  }

  return [];
}

export function VotersAvatars({
  votes,
  voters,
  items,
  placeId,
  maxVisible = 3,
  totalCount,
  showLabel = false,
  labelSuffix = 'подходит',
  size = 'sm',
  anonymousName = 'Друг',
  showWhenEmpty = false,
  className,
}: VotersAvatarsProps) {
  const normalizedItems = normalizeVoterItems({ votes, voters, items, placeId }, anonymousName);
  const resolvedTotal = totalCount ?? normalizedItems.length;

  if (resolvedTotal === 0 && !showWhenEmpty && !showLabel) {
    return null;
  }

  return (
    <Avatars
      items={normalizedItems}
      maxVisible={maxVisible}
      {...(totalCount !== undefined ? { totalCount } : {})}
      showLabel={showLabel}
      labelSuffix={labelSuffix}
      size={size}
      {...(className !== undefined ? { className } : {})}
    />
  );
}
