import type { Vote } from '@where-is-hype/core';
import { tally } from '@where-is-hype/core';
import clsx from 'clsx';
import { ThumbsUp } from 'lucide-react';
import type { HTMLAttributes } from 'react';

import { Chip } from '@/shared/ui/chip';

export type VoteCountVariant = 'badge' | 'button';

export interface VoteCountProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'onClick'> {
  count?: number | undefined;
  votes?: readonly Vote[] | undefined;
  placeId?: string | undefined;
  variant?: VoteCountVariant | undefined;
  selected?: boolean | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  errorText?: string | undefined;
  showLabel?: boolean | undefined;
  label?: string | undefined;
  onClick?: (() => void) | undefined;
}

function resolveVoteCount(
  count: number | undefined,
  votes: readonly Vote[] | undefined,
  placeId: string | undefined,
): number {
  if (count !== undefined) {
    return Math.max(0, count);
  }

  if (!votes) {
    return 0;
  }

  if (placeId !== undefined) {
    const counts = tally(votes);
    return counts[placeId] ?? 0;
  }

  const latestByVoter = new Map<string, Vote>();
  for (const vote of votes) {
    latestByVoter.set(vote.voterId, vote);
  }

  let activeVoters = 0;
  for (const vote of latestByVoter.values()) {
    if (vote.placeIds.length > 0) {
      activeVoters += 1;
    }
  }

  return activeVoters;
}

export function VoteCount({
  count,
  votes,
  placeId,
  variant,
  selected,
  disabled = false,
  loading = false,
  errorText,
  showLabel = false,
  label = 'подходит',
  onClick,
  className,
  ...rest
}: VoteCountProps) {
  const resolvedCount = resolveVoteCount(count, votes, placeId);
  const resolvedVariant: VoteCountVariant =
    variant ?? (onClick !== undefined || selected !== undefined ? 'button' : 'badge');

  if (resolvedVariant === 'button') {
    const isSelected = Boolean(selected);
    const isClosed = disabled && !isSelected && !loading;

    return (
      <Chip
        variant="vote"
        selected={isSelected}
        showCheck={isSelected}
        disabled={disabled}
        loading={loading}
        errorText={errorText}
        count={isClosed ? undefined : resolvedCount}
        icon={
          !isSelected && !isClosed ? (
            <ThumbsUp size={18} strokeWidth={2} aria-hidden="true" />
          ) : undefined
        }
        onClick={onClick}
        className={className}
      >
        {isClosed ? 'Голосование закрыто' : isSelected ? 'Подходит' : 'Мне подходит'}
      </Chip>
    );
  }

  if (showLabel) {
    return (
      <span
        data-vote-count={resolvedCount}
        className={clsx(
          'inline-flex items-baseline gap-1 font-ui text-sm leading-5',
          resolvedCount > 0 ? 'text-ink' : 'text-ink-muted',
          className,
        )}
        {...rest}
      >
        <span className="font-mono text-[13px] font-semibold">{resolvedCount}</span>
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span
      data-vote-count={resolvedCount}
      className={clsx(
        'min-w-[18px] text-right font-mono text-sm leading-5',
        resolvedCount > 0 ? 'font-semibold text-ink' : 'text-ink-muted',
        className,
      )}
      {...rest}
    >
      {resolvedCount}
    </span>
  );
}
