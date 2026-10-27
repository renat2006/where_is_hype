import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearStoredSession } from '@/entities/session';
import {
  getMyShortlist,
  shareMyShortlist,
  shortlistQueries,
  submitShortlistVote,
  updateMyShortlist,
  VoteCount,
} from '@/entities/shortlist';
import { enableMocks, readMockState, resetMockState, writeMockState } from '@/shared/api';

import { FriendVotePage } from './friend-vote-page';

function AuthorShortlistProbe() {
  const { data } = useQuery(shortlistQueries.mine());
  if (!data) {
    return null;
  }
  return (
    <div data-testid="author-shortlist-probe">
      {data.places.map((place) => (
        <VoteCount
          key={place.id}
          votes={data.votes}
          placeId={place.id}
          variant="badge"
          data-testid={`author-place-votes-${place.id}`}
        />
      ))}
    </div>
  );
}

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

function renderFriendVoteRoute(token: string, queryClient = createTestQueryClient()) {
  const router = createMemoryRouter(
    [
      {
        path: '/s/:token',
        element: <FriendVotePage />,
      },
      {
        path: '/welcome',
        element: <div data-testid="welcome-route">Экран знакомства</div>,
      },
      {
        path: '/evening',
        element: <AuthorShortlistProbe />,
      },
    ],
    {
      initialEntries: [`/s/${token}`],
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

async function seedSharedShortlist() {
  await updateMyShortlist(['sosny', 'zhuk-i-pchela', 'myata-na-kryshe']);
  const shared = await shareMyShortlist();
  await submitShortlistVote({
    token: shared.token,
    voterId: 'voter-katya',
    name: 'Катя',
    placeIds: ['sosny'],
  });
  return shared.token;
}

describe('FriendVotePage (US7)', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  beforeEach(() => {
    window.localStorage.clear();
    clearStoredSession();
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('opens /s/:token without session, renders header, lazy map with numbered stickers, mini-cards (address, metro, hours, check, video link), and tracks friend_page_opened', async () => {
    const token = await seedSharedShortlist();

    renderFriendVoteRoute(token);

    expect(screen.getByTestId('friend-vote-kicker')).toHaveTextContent(
      'Тебя позвали выбрать место',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Куда в пятницу?' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Основная' })).not.toBeInTheDocument();

    expect(await screen.findByTestId('friend-place-name-sosny')).toHaveTextContent('Сосны');
    expect(screen.getByTestId('friend-place-name-zhuk-i-pchela')).toHaveTextContent('Жук и Пчела');
    expect(screen.getByTestId('friend-place-name-myata-na-kryshe')).toHaveTextContent(
      'Мята на крыше',
    );

    expect(await screen.findByTestId('places-map')).toBeInTheDocument();
    expect(screen.getByTestId('map-marker-sosny')).toHaveTextContent('1');
    expect(screen.getByTestId('map-marker-zhuk-i-pchela')).toHaveTextContent('2');
    expect(screen.getByTestId('map-marker-myata-na-kryshe')).toHaveTextContent('3');

    expect(screen.getByTestId('friend-place-address-sosny')).toHaveTextContent(
      'ул. Большая Никитская, 12',
    );
    expect(screen.getByTestId('friend-place-metro-sosny')).toHaveTextContent('м. Охотный Ряд');
    expect(screen.getByTestId('friend-place-hours-sosny')).toBeInTheDocument();
    expect(screen.getByTestId('friend-place-price-sosny')).toHaveTextContent('2 500');
    expect(screen.getByTestId('friend-place-video-sosny')).toHaveAttribute(
      'href',
      expect.stringContaining('tiktok.com'),
    );

    await waitFor(() => {
      const events = readMockState().events;
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'friend_page_opened',
        }),
      );
    });
  });

  it('votes "Мне подходит" on one or multiple places, replaces previous vote from the same browser instead of adding a new voter, and tracks friend_voted', async () => {
    const token = await seedSharedShortlist();

    renderFriendVoteRoute(token);

    await screen.findByTestId('friend-place-name-sosny');

    const sosnyVoteBtn = screen.getByTestId('vote-button-sosny');
    const zhukVoteBtn = screen.getByTestId('vote-button-zhuk-i-pchela');
    const nameInput = screen.getByTestId('voter-name-input');

    expect(sosnyVoteBtn).toHaveAttribute('aria-pressed', 'false');
    expect(sosnyVoteBtn).toHaveTextContent('Мне подходит');
    expect(sosnyVoteBtn).toHaveTextContent('1');

    fireEvent.change(nameInput, { target: { value: 'Макс Лапин' } });
    fireEvent.click(sosnyVoteBtn);

    await waitFor(() => {
      expect(screen.getByTestId('vote-button-sosny')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('vote-button-sosny')).toHaveTextContent('Подходит');
      expect(screen.getByTestId('vote-button-sosny')).toHaveTextContent('2');
    });

    fireEvent.click(zhukVoteBtn);

    await waitFor(() => {
      expect(screen.getByTestId('vote-button-zhuk-i-pchela')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('vote-button-zhuk-i-pchela')).toHaveTextContent('Подходит');
      expect(screen.getByTestId('vote-button-zhuk-i-pchela')).toHaveTextContent('1');
    });

    // Repeat click from the same browser toggles off sosny rather than adding a 3rd voter
    fireEvent.click(screen.getByTestId('vote-button-sosny'));

    await waitFor(() => {
      expect(screen.getByTestId('vote-button-sosny')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('vote-button-sosny')).toHaveTextContent('1');
    });

    const authorShortlist = await getMyShortlist();
    // Only voter-katya and the current browser voter exist (2 voters total)
    expect(authorShortlist.votes).toHaveLength(2);
    expect(authorShortlist.votes[1]).toEqual(
      expect.objectContaining({
        name: 'Макс Лапин',
        placeIds: ['zhuk-i-pchela'],
      }),
    );

    await waitFor(() => {
      const events = readMockState().events;
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'friend_voted',
        }),
      );
    });
  });

  it('immediately reflects friend votes in author EveningPage in the same browser', async () => {
    const token = await seedSharedShortlist();
    const queryClient = createTestQueryClient();
    const { router } = renderFriendVoteRoute(token, queryClient);

    await screen.findByTestId('friend-place-name-myata-na-kryshe');

    fireEvent.click(screen.getByTestId('vote-button-myata-na-kryshe'));

    await waitFor(() => {
      expect(screen.getByTestId('vote-button-myata-na-kryshe')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    await router.navigate('/evening');

    expect(await screen.findByTestId('author-place-votes-myata-na-kryshe')).toHaveTextContent('1');
    const authorShortlist = await getMyShortlist();
    expect(authorShortlist.votes).toHaveLength(2);
  });

  it('shows a clear message when the shortlist link has expired', async () => {
    const token = await seedSharedShortlist();
    const db = readMockState();
    const existing = db.sharedShortlists[token];
    if (existing) {
      const expired = {
        ...existing,
        expiresAt: '2020-01-01T00:00:00.000Z',
      };
      db.sharedShortlists[token] = expired;
      db.shortlist = expired;
      writeMockState(db);
    }

    renderFriendVoteRoute(token);

    expect(await screen.findByText('Ссылка устарела')).toBeInTheDocument();
    expect(screen.getByText(/Срок действия ссылки/i)).toBeInTheDocument();
  });

  it('navigates to /welcome when clicking "Собирай свои места в «Где Хайп?»"', async () => {
    const token = await seedSharedShortlist();
    renderFriendVoteRoute(token);

    const welcomeLink = screen.getByTestId('friend-welcome-link');
    expect(welcomeLink).toHaveTextContent('Собирай свои места в «Где Хайп?»');

    fireEvent.click(welcomeLink);

    expect(await screen.findByTestId('welcome-route')).toBeInTheDocument();
  });
});
