import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { enableMocks, resetMockState } from '@/shared/api';
import * as analyticsModule from '@/shared/lib/analytics';
import { clearToasts } from '@/shared/ui/toast';

import {
  buildYandexMapsReviewsUrl,
  buildYandexMapsRouteLinks,
  getPlaceViewTransitionName,
  isLongPlaceTitle,
  openYandexMapsRoute,
  runWithViewTransition,
} from './place-links';
import { PlacePage } from './place-page';

function renderPlaceRoute(initialEntry: string, at?: Date) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <div data-testid="home-route">Мои места</div> },
      { path: '/place/:id', element: <PlacePage at={at} /> },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />);
}

describe('PlacePage (US5)', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  beforeEach(() => {
    clearToasts();
  });

  afterEach(() => {
    clearToasts();
    resetMockState();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders place card details, hours status, source video, note, and tracks card_opened', () => {
    const trackSpy = vi.spyOn(analyticsModule, 'track');
    const eveningDate = new Date('2026-10-27T16:00:00.000Z'); // 19:00 MSK

    renderPlaceRoute('/place/sosny', eveningDate);

    expect(trackSpy).toHaveBeenCalledWith('card_opened', {
      placeId: 'sosny',
      type: 'rest',
    });

    expect(screen.getByTestId('place-distance')).toHaveTextContent('450 м от тебя');

    const title = screen.getByTestId('place-title');
    expect(title).toHaveTextContent('Сосны');
    expect(title).toHaveAttribute('data-title-size', 'default');
    expect(title).toHaveClass('text-2xl');

    expect(screen.getByTestId('place-type')).toHaveTextContent('Ресторан');
    expect(screen.getByTestId('place-address')).toHaveTextContent('ул. Большая Никитская, 12');
    expect(screen.getByTestId('place-metro')).toHaveTextContent('Охотный Ряд');
    expect(screen.getByTestId('place-hours-status')).toHaveTextContent('Открыто до 00:00');
    expect(screen.getByTestId('place-price')).toHaveTextContent('чек 2 500 ₽');

    expect(screen.getByTestId('source-video-platform')).toHaveTextContent(
      'Исходный ролик · TikTok',
    );
    expect(screen.getByRole('link', { name: /vt\.tiktok\.com\/ZS8kQ2pLm/i })).toHaveAttribute(
      'href',
      'https://vt.tiktok.com/ZS8kQ2pLm/',
    );

    expect(screen.getByTestId('note-view-text')).toHaveTextContent(
      'столик у окна, брать пельмени с олениной',
    );

    const sticker = screen.getByTestId('place-sticker');
    expect(sticker).toHaveStyle({ viewTransitionName: getPlaceViewTransitionName('sosny') });
  });

  it('renders "Часы не уточнены" when place hours are null', () => {
    renderPlaceRoute('/place/zhuravli');

    const hours = screen.getByTestId('place-hours-status');
    expect(hours).toHaveAttribute('data-status-kind', 'unknown');
    expect(hours).toHaveTextContent('Часы не уточнены');
  });

  it('uses smaller heading size (text-xl) for long 3+ line place names', () => {
    expect(isLongPlaceTitle('Сосны')).toBe(false);
    expect(isLongPlaceTitle('Ночной трамвай на Чистых прудах, бар №2')).toBe(true);

    renderPlaceRoute('/place/nochnoy-tramvay');

    const title = screen.getByTestId('place-title');
    expect(title).toHaveTextContent('Ночной трамвай на Чистых прудах, бар №2');
    expect(title).toHaveAttribute('data-title-size', 'compact');
    expect(title).toHaveClass('text-xl');
  });

  it('builds Yandex Maps route scheme and web fallback URLs and tracks route_clicked', async () => {
    const user = userEvent.setup();
    const trackSpy = vi.spyOn(analyticsModule, 'track');
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderPlaceRoute('/place/sosny');

    const routeBtn = screen.getByTestId('place-route-button');
    expect(routeBtn).toHaveAttribute(
      'data-scheme-url',
      'yandexmaps://maps.yandex.ru/?rtext=~55.7568,37.6062&rtt=mt',
    );
    expect(routeBtn).toHaveAttribute(
      'data-web-url',
      'https://yandex.ru/maps/?rtext=~55.7568,37.6062&rtt=mt',
    );

    await user.click(routeBtn);

    expect(trackSpy).toHaveBeenCalledWith('route_clicked', {
      placeId: 'sosny',
      type: 'rest',
    });
    expect(openSpy).toHaveBeenCalledWith(
      'https://yandex.ru/maps/?rtext=~55.7568,37.6062&rtt=mt',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('supports yandexmaps:// scheme with timed web fallback in openYandexMapsRoute', () => {
    vi.useFakeTimers();
    const openScheme = vi.fn();
    const openWeb = vi.fn();

    const links = openYandexMapsRoute(
      { lat: 55.7568, lng: 37.6062 },
      { lat: 55.75, lng: 37.6 },
      {
        preferScheme: true,
        openScheme,
        openWeb,
        fallbackDelayMs: 500,
      },
    );

    expect(links).toEqual(
      buildYandexMapsRouteLinks({ lat: 55.7568, lng: 37.6062 }, { lat: 55.75, lng: 37.6 }),
    );
    expect(openScheme).toHaveBeenCalledWith(
      'yandexmaps://maps.yandex.ru/?rtext=55.75,37.6~55.7568,37.6062&rtt=mt',
    );
    expect(openWeb).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(openWeb).toHaveBeenCalledWith(
      'https://yandex.ru/maps/?rtext=55.75,37.6~55.7568,37.6062&rtt=mt',
    );
  });

  it('builds Yandex Maps reviews link by yandexOrgId or falls back to search by name and address', () => {
    renderPlaceRoute('/place/sosny');
    const orgReviewsLink = screen.getByTestId('place-reviews-link');
    expect(orgReviewsLink).toHaveAttribute('href', 'https://yandex.ru/maps/org/103001001/reviews/');

    expect(
      buildYandexMapsReviewsUrl({
        name: 'Тихий двор',
        address: 'Кривоколенный пер., 9',
        yandexOrgId: null,
      }),
    ).toBe(
      `https://yandex.ru/maps/?text=${encodeURIComponent('Тихий двор, Кривоколенный пер., 9')}`,
    );
  });

  it('provides slots for P12 (evening) and P14 (visit) actions', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/place/:id',
          element: (
            <PlacePage
              hereSlot={<button type="button">Я здесь</button>}
              eveningSlot={<button type="button">В «На вечер»</button>}
            />
          ),
        },
      ],
      { initialEntries: ['/place/sosny'] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('place-visit-slot')).toHaveTextContent('Я здесь');
    expect(screen.getByTestId('place-evening-slot')).toHaveTextContent('В «На вечер»');
  });

  it('uses document.startViewTransition when supported', () => {
    const callback = vi.fn();
    const startViewTransitionMock = vi.fn((cb: () => void) => {
      cb();
      return {};
    });

    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: startViewTransitionMock,
    });

    runWithViewTransition(callback);

    expect(startViewTransitionMock).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);

    Reflect.deleteProperty(document, 'startViewTransition');
  });
});
