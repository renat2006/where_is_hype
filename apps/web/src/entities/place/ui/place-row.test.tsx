import { fireEvent, render, screen } from '@testing-library/react';
import type { Place, SavedPlace } from '@where-is-hype/core';
import { describe, expect, it, vi } from 'vitest';

import { PlaceRow } from './place-row';

const basePlace: Place = {
  id: 'zhuk-i-pchela',
  name: 'Жук и Пчела',
  type: 'coffee',
  address: 'ул. Мясницкая, 24',
  metro: { name: 'Чистые пруды', distanceM: 350 },
  location: { lat: 55.7649, lng: 37.6389 },
  hours: null,
  avgCheck: 600,
  yandexOrgId: null,
};

describe('PlaceRow', () => {
  it('renders sticker without tilt, single-line truncated name, type · metro, hours status, and mono distance', () => {
    render(
      <PlaceRow place={basePlace} status={{ kind: 'open', until: '22:00' }} distanceM={350} />,
    );

    const sticker = screen.getByRole('img', { name: /Жук и Пчела/ });
    expect(sticker).toHaveAttribute('data-tilt', '0');

    const nameEl = screen.getByTestId('place-row-name');
    expect(nameEl).toHaveTextContent('Жук и Пчела');
    expect(nameEl).toHaveClass('truncate');

    expect(screen.getByText(/Кофейня · Чистые пруды/)).toBeInTheDocument();
    expect(screen.getByText('22:00')).toHaveClass('font-mono');

    const distanceEl = screen.getByTestId('place-row-distance');
    expect(distanceEl).toHaveTextContent('350 м');
    expect(distanceEl).toHaveClass('font-mono');
  });

  it('truncates 40+ character place names in a single line and renders visited state from SavedPlace', () => {
    const savedPlace: SavedPlace = {
      place: {
        ...basePlace,
        id: 'long-bar',
        name: 'Ночной трамвай на Чистых прудах, бар №2',
        type: 'bar',
        metro: { name: 'Китай-город', distanceM: 1200 },
      },
      sourceUrl: 'https://vt.tiktok.com/ZS8kQ2pLm',
      sourcePlatform: 'tiktok',
      note: '',
      addedAt: '2026-10-20T18:00:00.000Z',
      visits: [
        {
          at: '2026-10-21T19:00:00.000Z',
          verified: true,
          expectation: 'as_expected',
          comment: null,
        },
      ],
    };

    const onClick = vi.fn();
    render(<PlaceRow place={savedPlace} onClick={onClick} />);

    const row = screen.getByRole('button');
    expect(row).toHaveAttribute('data-visited', 'true');
    expect(row).not.toHaveClass('shadow-raised');

    const nameEl = screen.getByTestId('place-row-name');
    expect(nameEl).toHaveTextContent('Ночной трамвай на Чистых прудах, бар №2');
    expect(nameEl).toHaveClass('truncate');

    expect(screen.getByText('был здесь')).toBeInTheDocument();
    expect(screen.getByText('Часы не уточнены')).toBeInTheDocument();
    expect(screen.getByTestId('place-row-distance')).toHaveTextContent('1,2 км');

    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
