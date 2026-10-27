import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlaceTypeLabel } from './place-type-label';

describe('PlaceTypeLabel', () => {
  it('renders Russian labels for all place types', () => {
    const { rerender } = render(<PlaceTypeLabel type="coffee" />);
    expect(screen.getByText('Кофейня')).toBeInTheDocument();

    rerender(<PlaceTypeLabel type="cafe" />);
    expect(screen.getByText('Кафе')).toBeInTheDocument();

    rerender(<PlaceTypeLabel type="rest" />);
    expect(screen.getByText('Ресторан')).toBeInTheDocument();

    rerender(<PlaceTypeLabel type="bar" />);
    expect(screen.getByText('Бар')).toBeInTheDocument();
  });

  it('renders metro, address, and visited marker when provided', () => {
    const { container } = render(
      <PlaceTypeLabel
        type="bar"
        address="Покровка, 17"
        metro={{ name: 'Китай-город', distanceM: 400 }}
        visited
      />,
    );

    expect(container).toHaveTextContent('Бар · Покровка, 17 · Китай-город · был здесь');
    expect(screen.getByText('был здесь')).toHaveClass('text-ink');
  });
});
