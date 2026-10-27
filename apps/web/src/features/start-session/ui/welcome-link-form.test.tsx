import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { clearStoredSession, hasStoredSession } from '@/entities/session';
import { enableMocks, resetMockState } from '@/shared/api';

import { WelcomeLinkForm } from './welcome-link-form';

function AddPlaceDestination() {
  const location = useLocation();
  return <div data-testid="add-destination">{`${location.pathname}${location.search}`}</div>;
}

function renderWithRouter(initialUrl = '') {
  const router = createMemoryRouter(
    [
      {
        path: '/welcome',
        element: <WelcomeLinkForm initialUrl={initialUrl} />,
      },
      {
        path: '/add',
        element: <AddPlaceDestination />,
      },
    ],
    { initialEntries: ['/welcome'] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe('WelcomeLinkForm', () => {
  const originalClipboard = navigator.clipboard;

  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    clearStoredSession();
    resetMockState();
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('navigates to /add?url=... when user enters a link and clicks "Вставить ссылку"', async () => {
    renderWithRouter();

    const input = screen.getByLabelText('Ссылка на ролик');
    fireEvent.change(input, {
      target: { value: 'https://www.instagram.com/reel/hype-coffee/' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Вставить ссылку' }));

    await waitFor(() => {
      expect(screen.getByTestId('add-destination')).toHaveTextContent(
        '/add?url=https%3A%2F%2Fwww.instagram.com%2Freel%2Fhype-coffee%2F',
      );
    });
    expect(hasStoredSession()).toBe(true);
  });

  it('reads link from clipboard when input is empty and clipboard access is allowed', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: vi.fn().mockResolvedValue('https://vt.tiktok.com/ZS8kQ2pLm'),
      },
      configurable: true,
      writable: true,
    });

    renderWithRouter();

    fireEvent.click(screen.getByRole('button', { name: 'Вставить ссылку' }));

    await waitFor(() => {
      expect(screen.getByTestId('add-destination')).toHaveTextContent(
        '/add?url=https%3A%2F%2Fvt.tiktok.com%2FZS8kQ2pLm',
      );
    });
    expect(hasStoredSession()).toBe(true);
  });

  it('shows error note and focuses input when clipboard access is denied and input is empty', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      configurable: true,
      writable: true,
    });

    const router = renderWithRouter();

    fireEvent.click(screen.getByRole('button', { name: 'Вставить ссылку' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Не удалось вставить из буфера — вставь ссылку в поле вручную.',
      );
    });
    expect(router.state.location.pathname).toBe('/welcome');
    expect(screen.getByLabelText('Ссылка на ролик')).toHaveFocus();
  });
});
