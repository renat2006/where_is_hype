import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  DEMO_RECOGNIZED_LINK,
  DEMO_UNKNOWN_LINK,
  enableMocks,
  readMockState,
  resetMockState,
  setMockRealisticDelays,
} from '@/shared/api';
import { clearToasts } from '@/shared/ui/toast';

import { AddPlacePage, type AddPlacePageProps } from './add-place-page';

function PlaceCardStub() {
  const { id } = useParams();
  return <h1 data-testid="place-route">Карточка места: {id}</h1>;
}

function renderAddPlaceRoute(initialEntry = '/add', props?: AddPlacePageProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [
      { path: '/', element: <h1>Мои места</h1> },
      { path: '/add', element: <AddPlacePage {...props} /> },
      { path: '/place/:id', element: <PlaceCardStub /> },
    ],
    { initialEntries: [initialEntry] },
  );

  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

describe('AddPlacePage (US1 & US2)', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    setMockRealisticDelays(null);
    resetMockState();
    clearToasts();
    vi.restoreAllMocks();
  });

  it('renders link field, demo links, and resolves "Пример: кофейня" with confirmation before save', async () => {
    const user = userEvent.setup();
    renderAddPlaceRoute('/add', { showDemoLinks: true });

    expect(screen.getByRole('heading', { level: 1, name: 'Добавить место' })).toBeInTheDocument();

    const coffeeDemoBtn = screen.getByRole('button', { name: 'Пример: кофейня' });
    await user.click(coffeeDemoBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Это оно?' })).toBeInTheDocument();
    });

    // Nothing is saved before clicking "Да, сохранить"
    expect(readMockState().savedPlaces).toHaveLength(0);

    // Events link_pasted and candidates_shown are tracked
    await waitFor(() => {
      const events = readMockState().events.map((item) => item.event);
      expect(events).toContain('link_pasted');
      expect(events).toContain('candidates_shown');
    });

    await user.click(screen.getByRole('button', { name: 'Да, сохранить' }));

    await waitFor(() => {
      expect(screen.getByTestId('place-route')).toHaveTextContent('Карточка места: zhuk-i-pchela');
    });

    const db = readMockState();
    expect(db.savedPlaces).toHaveLength(1);
    expect(db.savedPlaces[0]?.place.id).toBe('zhuk-i-pchela');
    expect(db.savedPlaces[0]?.sourceUrl).toBe(DEMO_RECOGNIZED_LINK);
    expect(db.events.some((ev) => ev.event === 'place_saved' && ev.props?.source === 'link')).toBe(
      true,
    );
  });

  it('automatically resolves ?url= query parameter and shows "Уже в твоих местах · Открыть" for already saved place', async () => {
    const user = userEvent.setup();

    // First save zhuk-i-pchela
    const firstRender = renderAddPlaceRoute(`/add?url=${encodeURIComponent(DEMO_RECOGNIZED_LINK)}`);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Это оно?' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Да, сохранить' }));
    await waitFor(() => {
      expect(screen.getByTestId('place-route')).toHaveTextContent('Карточка места: zhuk-i-pchela');
    });
    firstRender.unmount();

    // Re-open /add with the same URL -> zhuk-i-pchela is now marked "Уже в твоих местах" with "Открыть"
    renderAddPlaceRoute(`/add?url=${encodeURIComponent(DEMO_RECOGNIZED_LINK)}`);

    await waitFor(() => {
      expect(screen.getByText('Уже в твоих местах')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    await waitFor(() => {
      expect(screen.getByTestId('place-route')).toHaveTextContent('Карточка места: zhuk-i-pchela');
    });
  });

  it('transitions to "Не узнали место" search when link is unrecognized, preserves link on save, and tracks place_saved (name)', async () => {
    const user = userEvent.setup();
    renderAddPlaceRoute('/add', { showDemoLinks: true });

    await user.click(screen.getByRole('button', { name: 'Пример: не распознаётся' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Не узнали место');
    });

    // The unrecognized URL is preserved in the link input
    expect(screen.getByLabelText('Ссылка на ролик')).toHaveValue(DEMO_UNKNOWN_LINK);

    const searchInput = screen.getByLabelText('Название места');
    await user.type(searchInput, 'С');
    expect(screen.getByText('Набери ещё букву')).toBeInTheDocument();

    await user.type(searchInput, 'осны');
    const options = await screen.findAllByRole('option');
    const sosnyOption = options.find((el) => el.textContent.includes('Сосны'));
    expect(sosnyOption).toBeDefined();
    if (sosnyOption) {
      await user.click(sosnyOption);
    }

    await waitFor(() => {
      expect(screen.getByTestId('place-route')).toHaveTextContent('Карточка места: sosny');
    });

    const db = readMockState();
    expect(db.savedPlaces).toHaveLength(1);
    expect(db.savedPlaces[0]?.place.id).toBe('sosny');
    expect(db.savedPlaces[0]?.sourceUrl).toBe(DEMO_UNKNOWN_LINK);
    expect(db.events.some((ev) => ev.event === 'place_saved' && ev.props?.source === 'name')).toBe(
      true,
    );
  });

  it('shows "Смотрим ролик…" 1/3-3/3 and slow hint "Долго думаем…" when loading exceeds threshold', async () => {
    const user = userEvent.setup();
    setMockRealisticDelays(true);

    renderAddPlaceRoute('/add', { showDemoLinks: true, slowThresholdMs: 25 });

    await user.click(screen.getByRole('button', { name: 'Пример: кофейня' }));

    expect(screen.getByText('Смотрим ролик…')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText('Долго думаем. Подождём ещё или найдём по названию?'),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Найти по названию' }));
    expect(screen.getByLabelText('Название места')).toBeInTheDocument();
  });
});
