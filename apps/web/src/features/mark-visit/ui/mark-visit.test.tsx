import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { savedPlaceQueries, seedDemoPlaces } from '@/entities/saved-place';
import { demoSeedPlacesFixture, enableMocks, readMockState, resetMockState } from '@/shared/api';
import * as analyticsModule from '@/shared/lib/analytics';
import { clearToasts } from '@/shared/ui/toast';

import { MarkVisitButton } from './mark-visit-button';

const foundSosny = demoSeedPlacesFixture.find((item) => item.place.id === 'sosny');
if (!foundSosny) {
  throw new Error('Expected sosny in demoSeedPlacesFixture');
}
const sosnySavedPlace = foundSosny;

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

describe('MarkVisitButton & MarkVisitModal (US8)', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  beforeEach(async () => {
    resetMockState();
    await seedDemoPlaces();
    clearToasts();
  });

  afterEach(() => {
    clearToasts();
    resetMockState();
    vi.restoreAllMocks();
  });

  it('marks visit as verified in demo mode, switches to unverified via demo toggle, and saves expectation', async () => {
    const user = userEvent.setup();
    const trackSpy = vi.spyOn(analyticsModule, 'track');

    renderWithQueryClient(
      <MarkVisitButton
        place={sosnySavedPlace.place}
        savedPlace={sosnySavedPlace}
        demoMode={true}
      />,
    );

    const markBtn = screen.getByTestId('mark-visit-button');
    expect(markBtn).toHaveTextContent('Я здесь');
    expect(markBtn).not.toBeDisabled();

    await user.click(markBtn);

    expect(screen.getByTestId('mark-visit-modal')).toBeInTheDocument();
    expect(screen.getByTestId('mark-visit-title')).toHaveTextContent('Визит отмечен');
    expect(screen.getByTestId('mark-visit-verification')).toHaveTextContent(
      'подтверждён · рядом, до 200 м',
    );
    expect(screen.getByText('Совпало с ожиданиями?')).toBeInTheDocument();

    expect(trackSpy).toHaveBeenCalledWith('visit_marked', {
      placeId: 'sosny',
      verified: true,
      status: 'verified',
    });

    const demoToggle = screen.getByTestId('mark-visit-demo-toggle');
    expect(demoToggle).toHaveTextContent('Демо: я рядом / я далеко');

    await user.click(demoToggle);

    expect(screen.getByTestId('mark-visit-verification')).toHaveTextContent(
      'без проверки · ты дальше 200 м',
    );
    expect(trackSpy).toHaveBeenCalledWith('visit_marked', {
      placeId: 'sosny',
      verified: false,
      status: 'not',
    });

    const betterChip = screen.getByTestId('expectation-chip-better');
    await user.click(betterChip);

    expect(trackSpy).toHaveBeenCalledWith('expectation_answered', {
      placeId: 'sosny',
      expectation: 'better',
    });

    const commentBox = screen.getByTestId('mark-visit-comment');
    await user.type(commentBox, 'Пельмени с олениной отличные');

    await user.click(screen.getByTestId('mark-visit-submit'));

    await waitFor(() => {
      expect(screen.queryByTestId('mark-visit-modal')).not.toBeInTheDocument();
    });

    const db = readMockState();
    const updatedSosny = db.savedPlaces.find((item) => item.place.id === 'sosny');
    expect(updatedSosny?.visits).toHaveLength(1);
    expect(updatedSosny?.visits[0]).toMatchObject({
      verified: false,
      expectation: 'better',
      comment: 'Пельмени с олениной отличные',
    });

    expect(screen.getByTestId('mark-visit-button')).toBeDisabled();
    expect(screen.getByText('Не больше одного визита в место за день')).toBeInTheDocument();
  });

  it('prevents marking a second visit on the same day', () => {
    const now = new Date('2026-10-27T18:00:00.000Z');
    const visitedSavedPlace = {
      ...sosnySavedPlace,
      visits: [
        {
          at: '2026-10-27T15:00:00.000Z',
          verified: true,
          expectation: 'as_expected' as const,
          comment: null,
        },
      ],
    };

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['saved-places', 'list'], [visitedSavedPlace]);

    render(
      <QueryClientProvider client={queryClient}>
        <MarkVisitButton place={sosnySavedPlace.place} savedPlace={visitedSavedPlace} at={now} />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('mark-visit-button')).toBeDisabled();
    expect(screen.getByText('Не больше одного визита в место за день')).toBeInTheDocument();
  });

  it('disables strike animation when prefers-reduced-motion is active', async () => {
    const user = userEvent.setup();
    const onVisitMarked = vi.fn();

    renderWithQueryClient(
      <MarkVisitButton
        place={sosnySavedPlace.place}
        savedPlace={sosnySavedPlace}
        demoMode={true}
        reducedMotion={true}
        onVisitMarked={onVisitMarked}
      />,
    );

    await user.click(screen.getByTestId('mark-visit-button'));

    expect(screen.getByTestId('mark-visit-modal')).toHaveAttribute('data-reduced-motion', 'true');
    expect(screen.getByTestId('mark-visit-strike-container')).toHaveAttribute(
      'data-motion-strike',
      'reduced',
    );

    await waitFor(() => {
      expect(onVisitMarked).toHaveBeenCalledTimes(1);
    });
  });

  it('evaluates real browser geolocation when demoMode is false', async () => {
    const user = userEvent.setup();
    const onVisitMarked = vi.fn();
    const originalGeo = navigator.geolocation;

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: {
              latitude: 55.8,
              longitude: 37.7,
              accuracy: 15,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          });
        },
      },
    });

    renderWithQueryClient(
      <MarkVisitButton
        place={sosnySavedPlace.place}
        savedPlace={sosnySavedPlace}
        demoMode={false}
        onVisitMarked={onVisitMarked}
      />,
    );

    await user.click(screen.getByTestId('mark-visit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('mark-visit-modal')).toBeInTheDocument();
      expect(onVisitMarked).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('mark-visit-verification')).toHaveTextContent(
      'без проверки · ты дальше 200 м',
    );
    expect(screen.queryByTestId('mark-visit-demo-toggle')).not.toBeInTheDocument();

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeo,
    });
  });
});
