import { render, screen } from '@testing-library/react';
import type { Place } from '@where-is-hype/core';
import { describe, expect, it } from 'vitest';

import { PlaceCard } from './place-card';

const place: Place = {
  id: 'p1',
  name: 'Кофейня во дворе',
  type: 'coffee',
  address: 'ул. Покровка, 17',
  metro: { name: 'Чистые пруды', distanceM: 450 },
  location: { lat: 55.7593, lng: 37.6478 },
  hours: null,
  avgCheck: 600,
  yandexOrgId: null,
};

describe('PlaceCard', () => {
  it('shows the name, address and place type', () => {
    render(<PlaceCard place={place} />);

    expect(screen.getByRole('heading', { name: place.name })).toBeInTheDocument();
    expect(screen.getByText(place.address)).toBeInTheDocument();
    expect(screen.getByText('Кофейня')).toBeInTheDocument();
  });

  it('omits address, metro, and hours when absent and renders source video link when provided', () => {
    const minimalPlace: Place = {
      ...place,
      address: '',
      metro: { name: '', distanceM: 0 },
      hours: null,
    };

    render(<PlaceCard place={minimalPlace} sourceUrl="https://www.instagram.com/reel/CxYz123/" />);

    expect(screen.getByRole('heading', { name: minimalPlace.name })).toBeInTheDocument();
    expect(screen.queryByText(/ул\. Покровка/)).not.toBeInTheDocument();
    expect(screen.queryByText(/м\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/Часы не уточнены/)).not.toBeInTheDocument();
    expect(screen.getByTestId('place-card-source-link')).toHaveAttribute(
      'href',
      'https://www.instagram.com/reel/CxYz123/',
    );
  });
});
