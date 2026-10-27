import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { clearStoredSession, setStoredSession } from '@/entities/session';
import { resetMockState } from '@/shared/api';

import { RequireSession } from './require-session';

describe('RequireSession', () => {
  afterEach(() => {
    clearStoredSession();
    resetMockState();
  });

  it('redirects to /welcome when there is no stored session', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <RequireSession>
              <div>Мои места</div>
            </RequireSession>
          ),
        },
        {
          path: '/welcome',
          element: <div>Экран знакомства</div>,
        },
      ],
      { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByText('Экран знакомства')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/welcome');
  });

  it('renders children when stored session exists', () => {
    setStoredSession({ id: 'usr-test-1', createdAt: '2026-10-27T10:00:00.000Z' });

    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <RequireSession>
              <div>Мои места</div>
            </RequireSession>
          ),
        },
        {
          path: '/welcome',
          element: <div>Экран знакомства</div>,
        },
      ],
      { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByText('Мои места')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
