import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { shortlistQueries, updateMyShortlist } from '@/entities/shortlist';
import { useShortlistState } from '@/features/shortlist-toggle/model/use-shortlist-toggle';
import { enableMocks, resetMockState } from '@/shared/api';
import { Sticker } from '@/shared/ui/sticker';

import { ShortlistToggleButton } from './shortlist-toggle-button';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe('features/shortlist-toggle (US6)', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  beforeEach(() => {
    window.localStorage.clear();
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('adds and removes a place in card mode and updates aria-pressed state', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const onToggled = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <ShortlistToggleButton placeId="sosny" mode="card" onToggled={onToggled} />
      </QueryClientProvider>,
    );

    const button = await screen.findByTestId('shortlist-toggle-button');
    expect(button).toHaveTextContent('В «На вечер»');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toBeDisabled();

    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(onToggled).toHaveBeenCalledWith(true, ['sosny']);
    });
    expect(button).toHaveTextContent('Уже в «На вечер»');

    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(onToggled).toHaveBeenCalledWith(false, []);
    });
    expect(button).toHaveTextContent('В «На вечер»');
  });

  it('toggles a place in row mode without triggering parent row click', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const onRowClick = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <div role="listitem" onClick={onRowClick}>
          <ShortlistToggleButton placeId="zhuk-i-pchela" placeName="Жук и Пчела" mode="row" />
        </div>
      </QueryClientProvider>,
    );

    const rowToggle = await screen.findByTestId('shortlist-row-toggle-zhuk-i-pchela');
    expect(rowToggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(rowToggle);

    await waitFor(() => {
      expect(rowToggle).toHaveAttribute('aria-pressed', 'true');
    });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('disables button and shows caption "Уже 5 мест" when shortlist has 5 places', async () => {
    const queryClient = createTestQueryClient();
    const initialFive = ['sosny', 'zhuk-i-pchela', 'myata-na-kryshe', 'zhuravli', 'okna-vo-dvor'];
    const seeded = await updateMyShortlist(initialFive);
    queryClient.setQueryData(shortlistQueries.mine().queryKey, seeded);

    render(
      <QueryClientProvider client={queryClient}>
        <div>
          <ShortlistToggleButton placeId="zerno" mode="card" />
          <ShortlistToggleButton
            placeId="pokrovka-coffee"
            placeName="Кофейня во дворе"
            mode="row"
          />
          <ShortlistToggleButton placeId="sosny" mode="card" />
        </div>
      </QueryClientProvider>,
    );

    const buttons = screen.getAllByTestId('shortlist-toggle-button');
    const sixthCardButton = buttons[0];
    const existingCardButton = buttons[1];

    expect(sixthCardButton).toBeDisabled();
    expect(screen.getAllByText('Уже 5 мест')).toHaveLength(2);

    const sixthRowButton = screen.getByTestId('shortlist-row-toggle-pokrovka-coffee');
    expect(sixthRowButton).toBeDisabled();
    expect(sixthRowButton).toHaveTextContent('Уже 5 мест');

    expect(existingCardButton).not.toBeDisabled();
    expect(existingCardButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders marker oval on map sticker for places selected into «На вечер»', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();

    function MapStickerProbe() {
      const { placeIds } = useShortlistState();
      const inEvening = placeIds.includes('sosny');
      return (
        <div data-testid="map-marker-sosny">
          <Sticker type="bar" size="md" placeId="sosny" name="Сосны" inEvening={inEvening} />
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <ShortlistToggleButton placeId="sosny" mode="card" />
        <MapStickerProbe />
      </QueryClientProvider>,
    );

    const sosnyMarker = screen.getByTestId('map-marker-sosny');
    expect(sosnyMarker.querySelector('[data-decor="marker-oval"]')).toBeNull();

    await user.click(screen.getByTestId('shortlist-toggle-button'));

    await waitFor(() => {
      expect(sosnyMarker.querySelector('[data-decor="marker-oval"]')).not.toBeNull();
    });
    expect(sosnyMarker.querySelector('[data-sticker-flag="true"]')).not.toBeNull();
  });
});
