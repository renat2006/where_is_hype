import { render, screen } from '@testing-library/react';
import type { Vote } from '@where-is-hype/core';
import { describe, expect, it } from 'vitest';

import { VotersAvatars } from './voters-avatars';

const sampleVotes: Vote[] = [
  { voterId: 'v1', name: 'Анна Козлова', placeIds: ['sosny'] },
  { voterId: 'v2', name: 'Максим Лебедев', placeIds: ['sosny', 'zhuk'] },
  { voterId: 'v3', placeIds: ['sosny'] },
  { voterId: 'v4', name: 'Ольга Петрова', placeIds: ['sosny'] },
  { voterId: 'v5', name: 'Сергей Волков', placeIds: ['sosny'] },
];

describe('VotersAvatars', () => {
  it('renders stacked voter initials for a place with +N mono overflow and anonymous fallback', () => {
    render(<VotersAvatars votes={sampleVotes} placeId="sosny" maxVisible={3} showLabel />);

    expect(screen.getByText('АК')).toBeInTheDocument();
    expect(screen.getByText('МЛ')).toBeInTheDocument();
    expect(screen.getByText('Д')).toBeInTheDocument();

    const overflow = screen.getByTestId('avatars-overflow');
    expect(overflow).toHaveTextContent('+2');
    expect(overflow).toHaveClass('font-mono');
    expect(screen.getByText('5')).toHaveClass('font-mono');
  });

  it('renders nothing when a place has zero votes', () => {
    const { container } = render(<VotersAvatars votes={sampleVotes} placeId="unvoted-place" />);
    expect(container).toBeEmptyDOMElement();
  });
});
