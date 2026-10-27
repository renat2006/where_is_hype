import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEveningFilterMemory } from '@/features/evening-filter';
import {
  resetGeoOriginState,
  selectMetroOrigin,
  setStoredGeoOriginState,
} from '@/features/geo-origin';
import { setOfflineStatusOverride, writePersistedPlacesCache } from '@/features/offline-status';
import { demoSeedPlacesFixture, enableMocks, resetMockState } from '@/shared/api';
import * as analyticsModule from '@/shared/lib/analytics';

import { MyPlacesPage } from './my-places-page';

function LocationReadout() {
  const location = useLocation();
  return (
    <div data-testid="router-location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderWithRouter(
  ui: React.ReactElement,
  initialEntry = '/',
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <>
            {ui}
            <LocationReadout />
          </>
        ),
      },
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

describe('MyPlacesPage', () => {
  const demoNow = new Date('2026-10-27T15:00:00+03:00');

  beforeAll(async () => {
    await enableMocks();
  });

  beforeEach(() => {
    window.localStorage.clear();
    setOfflineStatusOverride(null);
    resetGeoOriginState();
    resetEveningFilterMemory();
    resetMockState();
  });

  afterEach(() => {
    setOfflineStatusOverride(null);
    resetEveningFilterMemory();
    resetMockState();
  });

  it('tracks map_opened event once on mount and renders empty state (Screen 07)', () => {
    const trackSpy = vi.spyOn(analyticsModule, 'track');

    renderWithRouter(
      <MyPlacesPage places={[]} showDemoSeed autoRequestGeolocation={false} now={demoNow} />,
    );

    expect(trackSpy).toHaveBeenCalledTimes(1);
    expect(trackSpy).toHaveBeenCalledWith('map_opened');

    expect(screen.getByRole('heading', { level: 1, name: 'Мои места' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Пока пусто' })).toBeInTheDocument();
    expect(screen.getByText('Кинь ссылку на ролик, и место появится здесь.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Кинь ссылку' }));
    expect(screen.getByTestId('router-location')).toHaveTextContent('/add');

    trackSpy.mockRestore();
  });

  it('seeds 8 demo places from the empty state when VITE_API_MOCKS is active', async () => {
    renderWithRouter(<MyPlacesPage showDemoSeed autoRequestGeolocation={false} now={demoNow} />);

    const seedButton = await screen.findByRole('button', {
      name: 'Демо: добавить 8 мест',
    });
    fireEvent.click(seedButton);

    await waitFor(() => {
      expect(screen.getByTestId('places-sheet-summary')).toHaveTextContent('был в 1 из 8');
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  it('renders populated map and sheet sorted by distance and navigates to ?filter=1 on «На вечер»', () => {
    selectMetroOrigin('chistye-prudy');

    renderWithRouter(
      <MyPlacesPage
        places={demoSeedPlacesFixture.slice(3, 6)}
        autoRequestGeolocation={false}
        now={demoNow}
      />,
    );

    expect(screen.getByTestId('places-sheet-summary')).toHaveTextContent('был в 1 из 3');
    expect(
      screen.getByRole('button', {
        name: /Станция отсчёта: Чистые пруды/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'На вечер' }));
    expect(screen.getByTestId('router-location')).toHaveTextContent('/?filter=1');
    expect(screen.getByTestId('evening-filter-sheet')).toBeInTheDocument();
  });

  it('selects a place on sticker click and navigates to place card on second click', () => {
    renderWithRouter(
      <MyPlacesPage
        places={demoSeedPlacesFixture.slice(0, 2)}
        autoRequestGeolocation={false}
        now={demoNow}
      />,
    );

    const pokrovkaSticker = screen.getByTestId('map-marker-pokrovka-coffee');
    fireEvent.click(pokrovkaSticker);
    expect(screen.getByTestId('router-location')).toHaveTextContent('/');

    fireEvent.click(pokrovkaSticker);
    expect(screen.getByTestId('router-location')).toHaveTextContent('/place/pokrovka-coffee');
  });

  it('shows Screen 08 when geolocation is denied and allows changing metro station', () => {
    setStoredGeoOriginState({
      mode: 'geolocation',
      permissionStatus: 'denied',
      requestedOnce: true,
      metroStationId: null,
      userLocation: null,
    });

    renderWithRouter(
      <MyPlacesPage
        places={demoSeedPlacesFixture.slice(0, 2)}
        autoRequestGeolocation={false}
        now={demoNow}
      />,
    );

    expect(screen.getByRole('heading', { name: 'От какого метро считать?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Китай-город/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Считать от «Китай-города»' }));

    expect(
      screen.queryByRole('heading', { name: 'От какого метро считать?' }),
    ).not.toBeInTheDocument();

    const originMetroButton = screen.getByRole('button', {
      name: /Станция отсчёта: Китай-город/i,
    });
    expect(originMetroButton).toBeInTheDocument();

    fireEvent.click(originMetroButton);
    expect(screen.getByRole('heading', { name: 'От какого метро считать?' })).toBeInTheDocument();
  });

  it('applies evening filter immediately in URL, shows "Показать N из M", keeps unknown hours, tracks filter_applied, and preserves filter on card navigation and back', async () => {
    const trackSpy = vi.spyOn(analyticsModule, 'track');

    const { router } = renderWithRouter(
      <MyPlacesPage places={demoSeedPlacesFixture} autoRequestGeolocation={false} now={demoNow} />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(8);

    fireEvent.click(screen.getByRole('button', { name: 'На вечер' }));
    expect(screen.getByTestId('evening-filter-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '19:00' }));
    fireEvent.click(screen.getByRole('button', { name: /до 1500 ₽/i }));

    expect(screen.getByTestId('evening-filter-submit')).toHaveTextContent('Показать 4 из 8');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Часы не уточнены')).toBeInTheDocument();

    expect(trackSpy).toHaveBeenCalledWith(
      'filter_applied',
      expect.objectContaining({
        at: '19',
        maxCheck: 1500,
        matchedCount: 4,
        totalCount: 8,
      }),
    );

    fireEvent.click(screen.getByTestId('evening-filter-submit'));
    expect(screen.queryByTestId('evening-filter-sheet')).not.toBeInTheDocument();
    expect(screen.getByTestId('router-location')).toHaveTextContent('/?at=19&maxCheck=1500');
    expect(screen.getByTestId('evening-filter-trigger')).toHaveTextContent('Фильтр · 4');

    // Navigate into a place card and then navigate back
    fireEvent.click(screen.getByText('Журавли'));
    expect(screen.getByTestId('router-location')).toHaveTextContent('/place/zhuravli');

    await act(async () => {
      await router.navigate(-1);
    });
    expect(screen.getByTestId('router-location')).toHaveTextContent('/?at=19&maxCheck=1500');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);

    trackSpy.mockRestore();
  });

  it('shows Screen 10 "Ничего не подошло" when filter yields 0 results and resets on "Сбросить фильтры"', () => {
    renderWithRouter(
      <MyPlacesPage places={demoSeedPlacesFixture} autoRequestGeolocation={false} now={demoNow} />,
      '/?at=23&types=bar&maxCheck=1000&nearMetro=1',
    );

    expect(screen.getByRole('heading', { name: 'Ничего не подошло' })).toBeInTheDocument();
    expect(screen.getByTestId('evening-filter-trigger')).toHaveTextContent('Фильтр · 0');

    const resetButton = screen.getByRole('button', { name: 'Сбросить фильтры' });
    fireEvent.click(resetButton);

    expect(screen.queryByRole('heading', { name: 'Ничего не подошло' })).not.toBeInTheDocument();
    expect(screen.getByTestId('router-location')).toHaveTextContent(/^\/$/);
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  it('opens saved places offline from persisted cache with Screen 16 banner, timestamp, and disabled add action', () => {
    const updatedAtMs = new Date('2026-10-27T18:40:00+03:00').getTime();
    writePersistedPlacesCache(demoSeedPlacesFixture.slice(0, 4), updatedAtMs);
    setOfflineStatusOverride(true);

    renderWithRouter(<MyPlacesPage autoRequestGeolocation={false} now={demoNow} />);

    expect(screen.getByRole('status')).toHaveTextContent('Нет сети.');
    expect(screen.getByRole('status')).toHaveTextContent('Показываем сохранённое');
    expect(screen.getByTestId('offline-updated-at')).toHaveTextContent('обновлено в 18:40');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Добавить место · нужна сеть' })).toBeDisabled();
  });
});
