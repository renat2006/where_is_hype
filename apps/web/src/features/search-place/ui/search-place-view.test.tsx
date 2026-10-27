import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Place } from '@where-is-hype/core';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DEMO_UNKNOWN_LINK, enableMocks, readMockState, resetMockState } from '@/shared/api';
import { clearToasts } from '@/shared/ui/toast';

import { SearchPlaceView } from './search-place-view';

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SearchPlaceView', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    resetMockState();
    clearToasts();
    vi.restoreAllMocks();
  });

  it('shows single-char hint "Набери ещё букву", suggestions from 2nd char, and selects a place', async () => {
    const user = userEvent.setup();
    const onSelectPlace = vi.fn();
    const onOpenPlace = vi.fn();

    renderWithQuery(
      <SearchPlaceView
        savedPlaceIds={new Set()}
        onSelectPlace={onSelectPlace}
        onOpenPlace={onOpenPlace}
        onBack={() => undefined}
      />,
    );

    const searchInput = screen.getByLabelText('Название места');
    expect(screen.getByText('Подскажем со второй буквы')).toBeInTheDocument();

    await user.type(searchInput, 'Ж');
    expect(screen.getByText('Набери ещё букву')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.type(searchInput, 'у');
    await waitFor(() => {
      expect(screen.getByRole('listbox', { name: 'Подсказки' })).toBeInTheDocument();
    });

    const options = await screen.findAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(2);

    const firstOption = options[0];
    expect(firstOption).toBeDefined();
    if (firstOption) {
      await user.click(firstOption);
    }

    expect(onSelectPlace).toHaveBeenCalledTimes(1);
  });

  it('shows unrecognized link alert "Не узнали место" and submits POST /reports on "Сообщить"', async () => {
    const user = userEvent.setup();

    renderWithQuery(
      <SearchPlaceView
        unrecognized
        sourceUrl={DEMO_UNKNOWN_LINK}
        savedPlaceIds={new Set()}
        onSelectPlace={() => undefined}
        onOpenPlace={() => undefined}
        onBack={() => undefined}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Не узнали место');
    expect(screen.getByLabelText('Ссылка на ролик')).toHaveValue(DEMO_UNKNOWN_LINK);

    const searchInput = screen.getByLabelText('Название места');
    await user.type(searchInput, 'НесуществующееКафе');

    await waitFor(() => {
      expect(screen.getByText('Не нашли место?')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Сообщить' }));

    await waitFor(() => {
      const db = readMockState();
      expect(db.reports).toHaveLength(1);
      expect(db.reports[0]?.query).toBe('НесуществующееКафе');
      expect(db.reports[0]?.sourceUrl).toBe(DEMO_UNKNOWN_LINK);
    });
  });

  it('displays "Уже в твоих местах" with "Открыть" when selecting an already saved place', async () => {
    const user = userEvent.setup();
    const onSelectPlace = vi.fn<(place: Place) => void>();
    const onOpenPlace = vi.fn<(place: Place) => void>();

    renderWithQuery(
      <SearchPlaceView
        savedPlaceIds={new Set(['zhuravli'])}
        onSelectPlace={onSelectPlace}
        onOpenPlace={onOpenPlace}
        onBack={() => undefined}
      />,
    );

    const searchInput = screen.getByLabelText('Название места');
    await user.type(searchInput, 'Журав');

    const options = await screen.findAllByRole('option');
    const firstOption = options[0];
    expect(firstOption).toBeDefined();
    if (firstOption) {
      await user.click(firstOption);
    }

    expect(onSelectPlace).not.toHaveBeenCalled();
    expect(screen.getByText('Уже в твоих местах')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(onOpenPlace).toHaveBeenCalledTimes(1);
    expect(onOpenPlace.mock.calls[0]?.[0].id).toBe('zhuravli');
  });
});
