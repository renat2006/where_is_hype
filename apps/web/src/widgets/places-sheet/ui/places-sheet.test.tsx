import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { demoSeedPlacesFixture } from '@/shared/api';

import { PlacesSheet } from './places-sheet';

describe('PlacesSheet', () => {
  it('renders header "Мои места · был в N из M", sorts rows by distance, and supports peek/half/full snaps', async () => {
    const user = userEvent.setup();
    const onSelectPlace = vi.fn();
    const onSnapChange = vi.fn();
    const origin = { lat: 55.7649, lng: 37.6389 }; // Чистые пруды

    render(
      <PlacesSheet
        places={demoSeedPlacesFixture}
        origin={origin}
        defaultSnap="half"
        onSelectPlace={onSelectPlace}
        onSnapChange={onSnapChange}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Мои места' })).toBeInTheDocument();
    expect(screen.getByTestId('places-sheet-summary')).toHaveTextContent('был в 1 из 8');

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(8);

    const firstRow = items[0];
    expect(firstRow).toBeDefined();
    if (firstRow) {
      expect(within(firstRow).getByTestId('place-row-name')).toHaveTextContent('Журавли');
    }

    const handleButton = screen.getByRole('button', { name: 'Изменить размер шторки' });
    await user.click(handleButton);
    await user.keyboard('{Enter}');
    expect(onSnapChange).toHaveBeenCalledWith('full');
  });
});
