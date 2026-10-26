import { render, screen } from '@testing-library/react';
import type { Place } from '@where-is-hype/core';
import { describe, expect, it } from 'vitest';

import { PlaceCard } from './place-card';

const place: Place = {
  id: 'p1',
  name: 'Кофейня во дворе',
  address: 'ул. Покровка, 17',
  location: { lat: 55.7593, lng: 37.6478 },
  noiseLevel: 'loud',
  entrancePhotoUrl: null,
};

describe('PlaceCard', () => {
  it('shows the name, address and noise level', () => {
    render(<PlaceCard place={place} />);

    expect(screen.getByRole('heading', { name: place.name })).toBeInTheDocument();
    expect(screen.getByText(place.address)).toBeInTheDocument();
    expect(screen.getByText('Громко')).toBeInTheDocument();
  });
});
