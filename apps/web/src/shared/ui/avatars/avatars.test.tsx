import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatars } from './avatars';
import { getAvatarColorByName, getInitials } from './avatars-utils';

describe('Avatars', () => {
  it('computes initials and deterministic color from 3 sticker colors (without bar/tomato)', () => {
    expect(getInitials('Анна Козлова')).toBe('АК');
    expect(getInitials('Дима')).toBe('Д');
    expect(getInitials('МЛ')).toBe('МЛ');

    const c1 = getAvatarColorByName('АК');
    const c2 = getAvatarColorByName('МЛ');
    const c3 = getAvatarColorByName('Д');

    expect(c1).toBe('coffee');
    expect(c2).toBe('cafe');
    expect(c3).toBe('rest');
    expect(getAvatarColorByName('АК')).toBe(c1);
  });

  it('renders stacked initials and +N overflow counter in font-mono', () => {
    render(<Avatars items={['АК', 'МЛ', 'Д', 'ОП', 'СВ']} maxVisible={3} showLabel />);

    expect(screen.getByText('АК')).toHaveClass('bg-st-coffee');
    expect(screen.getByText('МЛ')).toHaveClass('bg-st-cafe');
    expect(screen.getByText('Д')).toHaveClass('bg-st-rest');

    const overflow = screen.getByTestId('avatars-overflow');
    expect(overflow).toHaveTextContent('+2');
    expect(overflow).toHaveClass('font-mono');
    expect(screen.getByText('5')).toHaveClass('font-mono');
  });
});
