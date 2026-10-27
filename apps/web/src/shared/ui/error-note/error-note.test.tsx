import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorNote } from './error-note';

describe('ErrorNote', () => {
  it('renders alert with note-bg token and action button', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <ErrorNote
        title="Не узнали место"
        description="Напиши название, найдём сами."
        actionLabel="Искать по названию"
        onAction={onAction}
      />,
    );

    const alertEl = screen.getByRole('alert');
    expect(alertEl).toHaveClass('bg-note-bg', 'text-ink');
    expect(screen.getByText('Не узнали место')).toBeInTheDocument();
    expect(screen.getByText('Напиши название, найдём сами.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Искать по названию' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
