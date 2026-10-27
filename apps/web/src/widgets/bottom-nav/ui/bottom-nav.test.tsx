import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { BottomNav, shouldShowBottomNav } from '@/widgets/bottom-nav';

describe('BottomNav', () => {
  it('renders Места, central + button to /add, and На вечер with counter', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <BottomNav eveningCount={3} />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Основная' });
    expect(nav).toBeInTheDocument();

    const placesLink = screen.getByRole('link', { name: /места/i });
    expect(placesLink).toHaveAttribute('href', '/');
    expect(placesLink).toHaveAttribute('aria-current', 'page');

    const addLink = screen.getByRole('link', { name: 'Добавить место' });
    expect(addLink).toHaveAttribute('href', '/add');

    const eveningLink = screen.getByRole('link', { name: /на вечер/i });
    expect(eveningLink).toHaveAttribute('href', '/evening');
    expect(eveningLink).toHaveTextContent('3');
  });

  it('shows bottom-nav only on /, /evening, and /place/:id', () => {
    expect(shouldShowBottomNav('/')).toBe(true);
    expect(shouldShowBottomNav('/evening')).toBe(true);
    expect(shouldShowBottomNav('/place/sosny')).toBe(true);

    expect(shouldShowBottomNav('/welcome')).toBe(false);
    expect(shouldShowBottomNav('/add')).toBe(false);
    expect(shouldShowBottomNav('/s/token123')).toBe(false);
    expect(shouldShowBottomNav('/settings')).toBe(false);
    expect(shouldShowBottomNav('/ui-kit')).toBe(false);
  });
});
