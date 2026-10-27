import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetGeoOriginState,
  selectMetroOrigin,
  setStoredGeoOriginState,
} from '@/features/geo-origin';
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
  beforeAll(async () => {
    await enableMocks();
  });

  beforeEach(() => {
    window.localStorage.clear();
    resetGeoOriginState();
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('tracks map_opened event once on mount and renders empty state (Screen 07)', () => {
    const trackSpy = vi.spyOn(analyticsModule, 'track');

    renderWithRouter(<MyPlacesPage places={[]} showDemoSeed autoRequestGeolocation={false} />);

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
    renderWithRouter(<MyPlacesPage showDemoSeed autoRequestGeolocation={false} />);

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
      <MyPlacesPage places={demoSeedPlacesFixture.slice(3, 6)} autoRequestGeolocation={false} />,
    );

    expect(screen.getByTestId('places-sheet-summary')).toHaveTextContent('был в 1 из 3');
    expect(
      screen.getByRole('button', {
        name: /Станция отсчёта: Чистые пруды/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'На вечер' }));
    expect(screen.getByTestId('router-location')).toHaveTextContent('/?filter=1');
  });

  it('selects a place on sticker click and navigates to place card on second click', () => {
    renderWithRouter(
      <MyPlacesPage places={demoSeedPlacesFixture.slice(0, 2)} autoRequestGeolocation={false} />,
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
      <MyPlacesPage places={demoSeedPlacesFixture.slice(0, 2)} autoRequestGeolocation={false} />,
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
});
