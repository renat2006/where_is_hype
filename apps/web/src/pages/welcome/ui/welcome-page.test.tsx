import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { clearStoredSession, getStoredSession } from '@/entities/session';
import { enableMocks, resetMockState } from '@/shared/api';

import { WelcomePage } from './welcome-page';

describe('WelcomePage', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    clearStoredSession();
    resetMockState();
  });

  it('renders onboarding content, single handwritten phrase, link field, and creates anonymous profile without personal data fields', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/welcome',
          element: <WelcomePage />,
        },
      ],
      { initialEntries: ['/welcome'] },
    );

    const { container } = render(<RouterProvider router={router} />);

    expect(
      screen.getByRole('heading', { level: 1, name: /Увидел в\s+рилсах — сходи вживую/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Кидай ссылку на ролик, а мы найдём место и положим на твою карту.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на ролик')).toHaveAttribute(
      'placeholder',
      'Instagram, TikTok, ВК, YouTube…',
    );
    expect(screen.getByRole('button', { name: 'Вставить ссылку' })).toBeInTheDocument();
    expect(screen.getByText('Без регистрации. Имя и телефон не нужны.')).toBeInTheDocument();

    // Only one handwritten phrase and no arrow/oval/tape decor
    const handwrittenElements = container.querySelectorAll('.font-hand');
    expect(handwrittenElements).toHaveLength(1);
    expect(handwrittenElements[0]).toHaveTextContent('просто вставь сюда');
    expect(container.querySelector('[data-decor]')).toBeNull();

    // Does not ask for name, phone, or email
    expect(screen.queryByLabelText(/имя|телефон|почта|email/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(getStoredSession()?.id).toMatch(/^usr-/);
    });
  });
});
