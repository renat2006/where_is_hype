import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Chip } from './chip';

describe('Chip', () => {
  it('renders selected and unselected states with aria-pressed and no shadow-raised', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { rerender } = render(
      <Chip selected={false} onClick={onClick}>
        Кофейня
      </Chip>,
    );

    const chip = screen.getByRole('button', { name: 'Кофейня' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).not.toHaveClass('shadow-raised');

    await user.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Chip selected showCheck onClick={onClick}>
        Кофейня
      </Chip>,
    );
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveClass('bg-ink', 'text-bg');
    expect(chip).not.toHaveClass('shadow-raised');
  });

  it('formats numbers inside label and count with font-mono', () => {
    render(
      <Chip variant="vote" count={2}>
        Мне подходит
      </Chip>,
    );

    const countEl = screen.getByText('2');
    expect(countEl).toHaveClass('font-mono');
  });
});
