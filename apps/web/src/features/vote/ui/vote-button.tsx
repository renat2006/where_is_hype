import type { Vote } from '@where-is-hype/core';
import { tally } from '@where-is-hype/core';
import { ThumbsUp } from 'lucide-react';

import { Chip } from '@/shared/ui/chip';

export interface VoteButtonProps {
  placeId: string;
  placeName?: string | undefined;
  votes?: readonly Vote[] | undefined;
  count?: number | undefined;
  selected?: boolean | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  errorText?: string | undefined;
  onToggle?: ((placeId: string) => void) | undefined;
  className?: string | undefined;
}

function resolvePlaceVoteCount(
  count: number | undefined,
  votes: readonly Vote[] | undefined,
  placeId: string,
): number {
  if (count !== undefined) {
    return Math.max(0, count);
  }
  if (!votes) {
    return 0;
  }
  return tally(votes)[placeId] ?? 0;
}

export function VoteButton({
  placeId,
  votes,
  count,
  selected = false,
  disabled = false,
  loading = false,
  errorText,
  onToggle,
  className,
}: VoteButtonProps) {
  const resolvedCount = resolvePlaceVoteCount(count, votes, placeId);
  const isClosed = disabled && !selected && !loading;

  return (
    <Chip
      variant="vote"
      selected={selected}
      showCheck={selected}
      disabled={disabled}
      loading={loading}
      errorText={errorText}
      count={isClosed ? undefined : resolvedCount}
      icon={
        !selected && !isClosed ? (
          <ThumbsUp size={18} strokeWidth={2} aria-hidden="true" />
        ) : undefined
      }
      onClick={() => {
        if (!disabled && !loading) {
          onToggle?.(placeId);
        }
      }}
      data-testid={`vote-button-${placeId}`}
      data-place-id={placeId}
      className={className}
    >
      {isClosed ? 'Голосование закрыто' : selected ? 'Подходит' : 'Мне подходит'}
    </Chip>
  );
}
