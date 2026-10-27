import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders title in font-display (>= 20px), description, and primary action button', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <EmptyState
        title="Пока пусто"
        description="Кинь ссылку на ролик, и место появится здесь."
        actionLabel="Вставить ссылку"
        onAction={onAction}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Пока пусто' });
    expect(heading).toHaveClass('font-display');
    expect(screen.getByText('Кинь ссылку на ролик, и место появится здесь.')).toBeInTheDocument();

    const btn = screen.getByRole('button', { name: 'Вставить ссылку' });
    expect(btn).toHaveClass('shadow-raised');

    await user.click(btn);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
