import { fireEvent, render, screen } from '@testing-library/react';
import type { Vote } from '@where-is-hype/core';
import { describe, expect, it, vi } from 'vitest';

import { VoteCount } from './vote-count';

const sampleVotes: Vote[] = [
  { voterId: 'v1', name: 'Анна Козлова', placeIds: ['sosny', 'zhuk'] },
  { voterId: 'v2', name: 'Максим Лебедев', placeIds: ['sosny'] },
  { voterId: 'v1', name: 'Анна Козлова', placeIds: ['sosny'] },
];

describe('VoteCount', () => {
  it('renders mono count in badge mode and computes tally from votes', () => {
    const { rerender } = render(<VoteCount votes={sampleVotes} placeId="sosny" />);

    const countEl = screen.getByText('2');
    expect(countEl).toHaveClass('font-mono', 'font-semibold', 'text-ink');

    rerender(<VoteCount votes={sampleVotes} placeId="zhuk" />);
    const zeroEl = screen.getByText('0');
    expect(zeroEl).toHaveClass('font-mono', 'text-ink-muted');

    rerender(<VoteCount count={5} showLabel />);
    expect(screen.getByText('5')).toHaveClass('font-mono');
    expect(screen.getByText('подходит')).toBeInTheDocument();
  });

  it('renders interactive vote button states (default, selected, disabled)', () => {
    const onClick = vi.fn();
    const { rerender } = render(<VoteCount count={2} selected={false} onClick={onClick} />);

    const voteBtn = screen.getByRole('button', { name: /Мне подходит/ });
    expect(voteBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(voteBtn);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<VoteCount count={3} selected onClick={onClick} />);
    const selectedBtn = screen.getByRole('button', { name: /Подходит/ });
    expect(selectedBtn).toHaveAttribute('aria-pressed', 'true');

    rerender(<VoteCount count={3} variant="button" disabled />);
    expect(screen.getByRole('button', { name: 'Голосование закрыто' })).toBeDisabled();
  });
});
