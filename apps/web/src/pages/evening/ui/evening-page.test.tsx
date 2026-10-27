import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { shareMyShortlist, submitShortlistVote, updateMyShortlist } from '@/entities/shortlist';
import { enableMocks, readMockState, resetMockState } from '@/shared/api';
import { clearToasts } from '@/shared/ui/toast';

import { EveningPage } from './evening-page';

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  });
}

function renderEveningPage(queryClient = createTestQueryClient()) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <div data-testid="map-route">Карта</div>,
      },
      {
        path: '/evening',
        element: <EveningPage />,
      },
      {
        path: '/place/:id',
        element: <div data-testid="place-route">Карточка места</div>,
      },
    ],
    {
      initialEntries: ['/evening'],
    },
  );

  return {
    queryClient,
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

async function seedThreePlacesWithVotes() {
  await updateMyShortlist(['sosny', 'zhuk-i-pchela', 'myata-na-kryshe']);
  const shared = await shareMyShortlist();
  await submitShortlistVote({
    token: shared.token,
    voterId: 'voter-1',
    name: 'Катя',
    placeIds: ['sosny', 'zhuk-i-pchela'],
  });
  await submitShortlistVote({
    token: shared.token,
    voterId: 'voter-2',
    name: 'Макс',
    placeIds: ['sosny'],
  });
  await submitShortlistVote({
    token: shared.token,
    voterId: 'voter-3',
    name: 'Оля',
    placeIds: ['sosny', 'myata-na-kryshe'],
  });
  return shared.token;
}

describe('EveningPage (US6)', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  beforeEach(() => {
    window.localStorage.clear();
    resetMockState();
    clearToasts();
  });

  afterEach(() => {
    resetMockState();
    vi.restoreAllMocks();
  });

  it('renders places, friend voter avatars, vote counts, and leader summary', async () => {
    await seedThreePlacesWithVotes();
    renderEveningPage();

    expect(screen.getByRole('heading', { level: 1, name: 'На вечер' })).toBeInTheDocument();

    expect(await screen.findByTestId('evening-place-name-sosny')).toBeInTheDocument();
    expect(screen.getByTestId('evening-place-name-zhuk-i-pchela')).toBeInTheDocument();
    expect(screen.getByTestId('evening-place-name-myata-na-kryshe')).toBeInTheDocument();

    expect(screen.getByTestId('evening-subtitle')).toHaveTextContent(
      'Ответили 3 друга · ссылка живёт 7 дней',
    );
    expect(screen.getByTestId('shortlist-leader')).toHaveTextContent('3 из 3.');

    expect(screen.getByTestId('evening-place-votes-sosny')).toHaveTextContent('3');
    expect(screen.getByTestId('evening-place-votes-zhuk-i-pchela')).toHaveTextContent('1');
    expect(screen.getByTestId('evening-place-votes-myata-na-kryshe')).toHaveTextContent('1');
  });

  it('disables share button when fewer than 2 places are selected and enables it from 2 places', async () => {
    await updateMyShortlist(['sosny']);

    renderEveningPage();

    await screen.findByTestId('evening-place-name-sosny');

    const shareButton = screen.getByTestId('evening-share-button');
    const openAsFriendButton = screen.getByTestId('evening-open-as-friend');

    expect(shareButton).toBeDisabled();
    expect(openAsFriendButton).toBeDisabled();
    expect(screen.getByTestId('shortlist-min-hint')).toHaveTextContent(
      'Добавь ещё хотя бы 1 место — кнопка «Отправить» активна с 2.',
    );
  });

  it('copies link to clipboard, shows toast "Ссылка скопирована", and tracks shortlist_shared when Web Share API is unavailable', async () => {
    await updateMyShortlist(['sosny', 'zhuk-i-pchela', 'myata-na-kryshe']);

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });

    renderEveningPage();

    await screen.findByTestId('evening-place-name-sosny');

    const shareButton = screen.getByTestId('evening-share-button');
    expect(shareButton).toBeEnabled();

    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('/s/evening-demo'));
    });

    expect(await screen.findByText('Ссылка скопирована')).toBeInTheDocument();

    await waitFor(() => {
      const events = readMockState().events;
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'shortlist_shared',
        }),
      );
    });
  });

  it('uses Web Share API when navigator.share is available and tracks shortlist_shared', async () => {
    await updateMyShortlist(['sosny', 'zhuk-i-pchela']);

    const shareMock = vi.fn<(data?: ShareData) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: shareMock,
    });

    renderEveningPage();

    await screen.findByTestId('evening-place-name-sosny');

    fireEvent.click(screen.getByTestId('evening-share-button'));

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalledTimes(1);
    });
    expect(shareMock.mock.calls[0]?.[0]?.url).toContain('/s/evening-demo');

    await waitFor(() => {
      const events = readMockState().events;
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'shortlist_shared',
        }),
      );
    });
  });

  it('opens /s/:token in a new tab when clicking "Открыть как друг"', async () => {
    await updateMyShortlist(['sosny', 'zhuk-i-pchela']);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderEveningPage();

    await screen.findByTestId('evening-place-name-sosny');

    fireEvent.click(screen.getByTestId('evening-open-as-friend'));

    expect(openSpy).toHaveBeenCalledWith('/s/evening-demo', '_blank', 'noopener,noreferrer');
  });

  it('refetches shortlist on window focus so friend votes appear immediately after returning', async () => {
    const token = await seedThreePlacesWithVotes();
    renderEveningPage();

    await screen.findByTestId('evening-place-name-sosny');
    expect(screen.getByTestId('evening-place-votes-myata-na-kryshe')).toHaveTextContent('1');

    await submitShortlistVote({
      token,
      voterId: 'voter-expert',
      name: 'Эксперт',
      placeIds: ['myata-na-kryshe', 'sosny'],
    });

    fireEvent(window, new Event('focus'));

    await waitFor(() => {
      expect(screen.getByTestId('evening-place-votes-myata-na-kryshe')).toHaveTextContent('2');
    });
    expect(screen.getByTestId('evening-subtitle')).toHaveTextContent(
      'Ответили 4 друга · ссылка живёт 7 дней',
    );
  });

  it('disables "Добавить место" and shows 5-place limit caption when shortlist has 5 places', async () => {
    await updateMyShortlist([
      'sosny',
      'zhuk-i-pchela',
      'myata-na-kryshe',
      'zhuravli',
      'okna-vo-dvor',
    ]);

    renderEveningPage();

    await screen.findByTestId('evening-place-name-sosny');

    expect(screen.getByTestId('evening-add-place')).toBeDisabled();
    expect(screen.getByTestId('shortlist-max-hint')).toHaveTextContent(
      'Больше 5 нельзя: «В „На вечер“» на карточке становится неактивной с подписью «Уже 5 мест».',
    );
  });
});
