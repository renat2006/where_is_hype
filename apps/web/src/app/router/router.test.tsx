import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearStoredSession, setStoredSession } from '@/entities/session';

import { routes } from './router';

describe('app router', () => {
  beforeEach(() => {
    setStoredSession({ id: 'usr-router-test', createdAt: '2026-10-27T10:00:00.000Z' });
  });

  afterEach(() => {
    clearStoredSession();
  });

  it.each([
    { path: '/', heading: 'Мои места', hasNav: true },
    { path: '/welcome', heading: /Увидел в\s+рилсах — сходи вживую/, hasNav: false },
    { path: '/add', heading: 'Добавить место', hasNav: false },
    { path: '/place/sosny', heading: 'Карточка места', hasNav: true },
    { path: '/evening', heading: 'На вечер', hasNav: true },
    { path: '/s/abc123', heading: 'Куда в пятницу?', hasNav: false },
    { path: '/settings', heading: 'Настройки', hasNav: false },
    { path: '/ui-kit', heading: 'UI-кит', hasNav: false },
    { path: '/unknown-route', heading: 'Такой страницы нет', hasNav: false },
  ])('renders route $path (bottom-nav: $hasNav)', ({ path, heading, hasNav }) => {
    const memoryRouter = createMemoryRouter(routes, { initialEntries: [path] });
    render(<RouterProvider router={memoryRouter} />);

    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();

    const nav = screen.queryByRole('navigation', { name: 'Основная' });
    if (hasNav) {
      expect(nav).toBeInTheDocument();
    } else {
      expect(nav).not.toBeInTheDocument();
    }
  });

  it('redirects / to /welcome when there is no anonymous profile yet', () => {
    clearStoredSession();
    const memoryRouter = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(<RouterProvider router={memoryRouter} />);

    expect(memoryRouter.state.location.pathname).toBe('/welcome');
    expect(
      screen.getByRole('heading', { level: 1, name: /Увидел в\s+рилсах — сходи вживую/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Основная' })).not.toBeInTheDocument();
  });
});
