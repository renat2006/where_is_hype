import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { routes } from './router';

describe('app router', () => {
  it.each([
    { path: '/', heading: 'Мои места', hasNav: true },
    { path: '/welcome', heading: 'Знакомство', hasNav: false },
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
});
