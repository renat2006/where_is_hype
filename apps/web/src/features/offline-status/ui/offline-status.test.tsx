import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { savedPlaceQueries } from '@/entities/saved-place';
import {
  OfflineActionButton,
  OfflinePlacesView,
  setOfflineStatusOverride,
  setupQueryClientPersistence,
  SLOW_NETWORK_THRESHOLD_MS,
  SlowNetworkView,
  writePersistedPlacesCache,
} from '@/features/offline-status';
import { demoSeedPlacesFixture } from '@/shared/api';

describe('features/offline-status UI', () => {
  const demoNow = new Date('2026-10-27T19:00:00+03:00');
  const updatedAtMs = new Date('2026-10-27T18:40:00+03:00').getTime();

  beforeEach(() => {
    window.localStorage.clear();
    setOfflineStatusOverride(null);
  });

  afterEach(() => {
    window.localStorage.clear();
    setOfflineStatusOverride(null);
    vi.useRealTimers();
  });

  it('renders Screen 16 (OfflinePlacesView) from persisted TanStack Query cache with banner, updated time, and disabled action', () => {
    const cachedPlaces = demoSeedPlacesFixture.slice(0, 4);
    writePersistedPlacesCache(cachedPlaces, updatedAtMs);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    setupQueryClientPersistence(queryClient);

    expect(queryClient.getQueryData(savedPlaceQueries.list().queryKey)).toHaveLength(4);

    render(
      <QueryClientProvider client={queryClient}>
        <OfflinePlacesView now={demoNow} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Нет сети.');
    expect(screen.getByRole('status')).toHaveTextContent('Показываем сохранённое');
    expect(screen.getByRole('heading', { name: 'Мои места' })).toBeInTheDocument();
    expect(screen.getByTestId('offline-updated-at')).toHaveTextContent('обновлено в 18:40');

    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Кофейня во дворе')).toBeInTheDocument();
    expect(screen.getByText('Мята на крыше')).toBeInTheDocument();
    expect(screen.getByText('Журавли')).toBeInTheDocument();
    expect(screen.getByText('Окна во двор')).toBeInTheDocument();
    expect(screen.getByText('Часы не уточнены')).toBeInTheDocument();

    expect(screen.getByTestId('offline-explanation')).toHaveTextContent(
      'Карта, добавление места и отправка друзьям вернутся, когда появится сеть. Расстояния — по последней точке.',
    );

    const addPlaceButton = screen.getByRole('button', {
      name: 'Добавить место · нужна сеть',
    });
    expect(addPlaceButton).toBeDisabled();
  });

  it('disables OfflineActionButton and appends «· нужна сеть» when offline', () => {
    const onClick = vi.fn();
    setOfflineStatusOverride(true);

    const { rerender } = render(<OfflineActionButton label="Отправить" onClick={onClick} />);

    const offlineBtn = screen.getByRole('button', { name: 'Отправить · нужна сеть' });
    expect(offlineBtn).toBeDisabled();
    fireEvent.click(offlineBtn);
    expect(onClick).not.toHaveBeenCalled();

    setOfflineStatusOverride(false);
    rerender(<OfflineActionButton label="Отправить" onClick={onClick} />);

    const onlineBtn = screen.getByRole('button', { name: 'Отправить' });
    expect(onlineBtn).not.toBeDisabled();
    fireEvent.click(onlineBtn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders SlowNetworkView with skeletons and reveals «Сеть медленная. Карта догрузится» after 5 seconds without layout shift', () => {
    vi.useFakeTimers();

    render(<SlowNetworkView isLoading />);

    expect(screen.getByTestId('slow-network-map-skeleton')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-place-row')).toHaveLength(2);
    expect(screen.getByTestId('slow-network-hint-slot')).toHaveClass('min-h-[44px]');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(SLOW_NETWORK_THRESHOLD_MS - 100);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const slowBanner = screen.getByRole('status');
    expect(slowBanner).toHaveTextContent('Сеть медленная.');
    expect(slowBanner).toHaveTextContent('Карта догрузится');
  });
});
