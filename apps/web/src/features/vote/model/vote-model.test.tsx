import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Shortlist } from '@where-is-hype/core';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  getMyShortlist,
  shareMyShortlist,
  shortlistQueries,
  updateMyShortlist,
} from '@/entities/shortlist';
import { enableMocks, readMockState, resetMockState } from '@/shared/api';

import {
  countActiveVoters,
  findVoterVote,
  getStoredVoterName,
  getVoterPlaceIds,
  isPlaceVotedByMe,
  isShortlistExpired,
  normalizeVoterName,
  setStoredVoterName,
  toggleVotedPlaceIds,
  useFriendVote,
} from './vote-model';

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

describe('vote-model pure helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('normalizes and persists optional voter name', () => {
    expect(normalizeVoterName('   ')).toBeUndefined();
    expect(normalizeVoterName('  Макс  ')).toBe('Макс');

    setStoredVoterName('  Аня  ');
    expect(getStoredVoterName()).toBe('Аня');

    setStoredVoterName('   ');
    expect(getStoredVoterName()).toBe('');
  });

  it('toggles place ids and extracts voter places without duplicates', () => {
    expect(toggleVotedPlaceIds([], 'sosny')).toEqual(['sosny']);
    expect(toggleVotedPlaceIds(['sosny'], 'zhuk-i-pchela')).toEqual(['sosny', 'zhuk-i-pchela']);
    expect(toggleVotedPlaceIds(['sosny', 'zhuk-i-pchela'], 'sosny')).toEqual(['zhuk-i-pchela']);

    const votes = [
      { voterId: 'v-1', name: 'Катя', placeIds: ['sosny', 'zhuk-i-pchela'] },
      { voterId: 'v-2', placeIds: [] },
    ];
    expect(findVoterVote(votes, 'v-1')?.name).toBe('Катя');
    expect(getVoterPlaceIds(votes, 'v-1')).toEqual(['sosny', 'zhuk-i-pchela']);
    expect(isPlaceVotedByMe(votes, 'v-1', 'sosny')).toBe(true);
    expect(isPlaceVotedByMe(votes, 'v-1', 'myata-na-kryshe')).toBe(false);
    expect(countActiveVoters(votes)).toBe(1);
  });

  it('detects expired shortlists', () => {
    const now = new Date('2026-10-27T18:00:00.000Z');
    expect(isShortlistExpired({ expiresAt: '2026-10-27T17:59:59.000Z' }, now)).toBe(true);
    expect(isShortlistExpired({ expiresAt: '2026-10-27T18:00:00.000Z' }, now)).toBe(true);
    expect(isShortlistExpired({ expiresAt: '2026-10-28T18:00:00.000Z' }, now)).toBe(false);
  });
});

describe('useFriendVote hook', () => {
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

  it('submits multiple place votes from the same browser, replaces previous vote instead of adding a new voter, and updates author shortlist', async () => {
    await updateMyShortlist(['sosny', 'zhuk-i-pchela', 'myata-na-kryshe']);
    const shared: Shortlist = await shareMyShortlist();

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(shortlistQueries.mine().queryKey, shared);
    queryClient.setQueryData(shortlistQueries.byToken(shared.token).queryKey, shared);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useFriendVote({
          token: shared.token,
          shortlist: shared,
        }),
      { wrapper },
    );

    act(() => {
      result.current.setVoterName('Денис');
    });

    await act(async () => {
      await result.current.togglePlaceVote('sosny');
    });

    expect(result.current.selectedPlaceIds).toEqual(['sosny']);
    expect(result.current.activeVotersCount).toBe(1);

    await act(async () => {
      await result.current.togglePlaceVote('zhuk-i-pchela');
    });

    expect(result.current.selectedPlaceIds).toEqual(['sosny', 'zhuk-i-pchela']);
    expect(result.current.activeVotersCount).toBe(1);

    await act(async () => {
      await result.current.togglePlaceVote('sosny');
    });

    expect(result.current.selectedPlaceIds).toEqual(['zhuk-i-pchela']);
    expect(result.current.activeVotersCount).toBe(1);

    const authorShortlist = await getMyShortlist();
    expect(authorShortlist.votes).toHaveLength(1);
    expect(authorShortlist.votes[0]).toEqual({
      voterId: result.current.voterId,
      name: 'Денис',
      placeIds: ['zhuk-i-pchela'],
    });

    await waitFor(() => {
      const events = readMockState().events;
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'friend_voted',
        }),
      );
    });
  });
});
