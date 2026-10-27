import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { demoSeedPlacesFixture, placesFixture } from '@/shared/api';

import { PlacesMap } from './places-map';

describe('PlacesMap', () => {
  it('renders place stickers, Garden Ring, user location dot, and handles selection', async () => {
    const user = userEvent.setup();
    const onSelectPlace = vi.fn();

    render(
      <PlacesMap
        places={demoSeedPlacesFixture}
        selectedPlaceId="sosny"
        clusterRadiusPx={0}
        userLocation={{ lat: 55.7558, lng: 37.6173 }}
        onSelectPlace={onSelectPlace}
      />,
    );

    expect(screen.getByTestId('places-map-garden-ring')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Моя точка' })).toBeInTheDocument();

    const sosnyButton = screen.getByRole('button', { name: 'Сосны' });
    expect(sosnyButton).toHaveAttribute('data-selected', 'true');

    const zhukButton = screen.getByRole('button', { name: 'Кофейня во дворе' });
    await user.click(zhukButton);
    expect(onSelectPlace).toHaveBeenCalledWith(
      'pokrovka-coffee',
      expect.objectContaining({
        place: expect.objectContaining({ id: 'pokrovka-coffee' }) as unknown,
      }),
    );
  });

  it('merges overlapping places into clusters with count for 40 places', () => {
    render(<PlacesMap places={placesFixture} clusterRadiusPx={60} />);

    const clusterButtons = screen.getAllByRole('button', { name: /Кластер:/i });
    expect(clusterButtons.length).toBeGreaterThan(0);
  });
});
