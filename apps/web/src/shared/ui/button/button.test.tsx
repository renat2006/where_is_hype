import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders all variants and applies shadow-raised only to primary', () => {
    const { rerender } = render(<Button variant="primary">Да, сохранить</Button>);
    const primaryBtn = screen.getByRole('button', { name: 'Да, сохранить' });
    expect(primaryBtn).toHaveClass('shadow-raised');

    rerender(<Button variant="secondary">Маршрут</Button>);
    expect(screen.getByRole('button', { name: 'Маршрут' })).not.toHaveClass('shadow-raised');

    rerender(<Button variant="text">Сбросить</Button>);
    expect(screen.getByRole('button', { name: 'Сбросить' })).not.toHaveClass('shadow-raised');

    rerender(
      <Button variant="map" aria-label="Где я">
        📍
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Где я' })).not.toHaveClass('shadow-raised');
  });

  it('handles loading state with aria-busy and prevents clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button loading loadingLabel="Сохраняем" onClick={onClick}>
        Да, сохранить
      </Button>,
    );

    const btn = screen.getByRole('button', { name: 'Сохраняем' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    expect(screen.getByTestId('loading-dots')).toBeInTheDocument();

    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders error caption when errorText is provided', () => {
    render(<Button errorText="Не сохранилось">Повторить</Button>);
    expect(screen.getByText('Не сохранилось')).toBeInTheDocument();
  });
});
