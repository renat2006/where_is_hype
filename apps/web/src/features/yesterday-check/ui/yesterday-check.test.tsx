import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Shortlist } from '@where-is-hype/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { savedPlaceQueries, seedDemoPlaces } from '@/entities/saved-place';
import { clearYesterdayCheckDismissals } from '@/features/yesterday-check/model/yesterday-check-model';
import { demoSeedPlacesFixture, enableMocks, readMockState, resetMockState } from '@/shared/api';
import * as analyticsModule from '@/shared/lib/analytics';
import { clearToasts } from '@/shared/ui/toast';

import { YesterdayCheckModal } from './yesterday-check-modal';

const yesterdayShortlist: Shortlist = {
  token: 's1',
  places: demoSeedPlacesFixture.slice(2, 5).map((item) => item.place), // zhuravli, okna-vo-dvor, sosny
  createdAt: '2026-10-26T18:00:00.000Z',
  expiresAt: '2026-11-02T18:00:00.000Z',
  votes: [],
};

const nextDay = new Date('2026-10-27T08:00:00.000Z');

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 60_000,
      },
    },
  });
  queryClient.setQueryData(savedPlaceQueries.list().queryKey, demoSeedPlacesFixture);
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('YesterdayCheckModal (US8)', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  beforeEach(async () => {
    resetMockState();
    await seedDemoPlaces();
    clearYesterdayCheckDismissals();
    clearToasts();
  });

  afterEach(() => {
    clearYesterdayCheckDismissals();
    clearToasts();
    resetMockState();
    vi.restoreAllMocks();
  });

  it('does not render on the same day when shortlist was created today', () => {
    const sameDay = new Date('2026-10-26T20:00:00.000Z');
    renderWithQueryClient(<YesterdayCheckModal shortlist={yesterdayShortlist} now={sameDay} />);

    expect(screen.queryByTestId('yesterday-check-modal')).not.toBeInTheDocument();
  });

  it('renders on the next day, marks selected places as visited, and closes on Готово', async () => {
    const user = userEvent.setup();
    const trackSpy = vi.spyOn(analyticsModule, 'track');

    renderWithQueryClient(<YesterdayCheckModal shortlist={yesterdayShortlist} now={nextDay} />);

    expect(screen.getByTestId('yesterday-check-modal')).toBeInTheDocument();
    expect(screen.getByTestId('yesterday-check-title')).toHaveTextContent('Сходили вчера?');
    expect(screen.getByTestId('yesterday-check-subtitle')).toHaveTextContent(
      'Вы выбирали из 3 мест. Отметь, куда дошли — зачеркнём на карте.',
    );

    const sosnyRow = screen.getByTestId('yesterday-check-place-sosny');
    await user.click(sosnyRow);

    expect(sosnyRow).toHaveAttribute('data-marked', 'true');
    expect(trackSpy).toHaveBeenCalledWith('visit_marked', {
      placeId: 'sosny',
      verified: false,
      status: 'not',
    });

    await waitFor(() => {
      const db = readMockState();
      const sosny = db.savedPlaces.find((item) => item.place.id === 'sosny');
      expect(sosny?.visits).toHaveLength(1);
    });

    const doneBtn = screen.getByTestId('yesterday-check-done');
    await user.click(doneBtn);

    expect(screen.queryByTestId('yesterday-check-modal')).not.toBeInTheDocument();
  });

  it('closes and persists dismissal when clicking "Не дошли" or "Не спрашивать про этот вечер"', async () => {
    const user = userEvent.setup();

    const { unmount } = renderWithQueryClient(
      <YesterdayCheckModal shortlist={yesterdayShortlist} now={nextDay} />,
    );

    expect(screen.getByTestId('yesterday-check-modal')).toBeInTheDocument();
    await user.click(screen.getByTestId('yesterday-check-did-not-go'));

    expect(screen.queryByTestId('yesterday-check-modal')).not.toBeInTheDocument();

    unmount();

    renderWithQueryClient(<YesterdayCheckModal shortlist={yesterdayShortlist} now={nextDay} />);
    expect(screen.queryByTestId('yesterday-check-modal')).not.toBeInTheDocument();
  });
});
