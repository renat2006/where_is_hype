import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PriceLabel } from './price-label';

describe('PriceLabel', () => {
  it('renders average check with mono digits and non-breaking spaces', () => {
    const { rerender } = render(<PriceLabel avgCheck={2500} />);

    const monoValue = screen.getByText('2 500 ₽');
    expect(monoValue).toHaveClass('font-mono');
    expect(monoValue.parentElement).toHaveAttribute('data-price-status', 'known');
    expect(monoValue.parentElement).toHaveTextContent('чек 2 500 ₽');

    rerender(<PriceLabel price={1500} prefix="до" />);
    expect(screen.getByText('1 500 ₽').parentElement).toHaveTextContent('до 1 500 ₽');
  });

  it('renders unknown text when avgCheck is null or undefined', () => {
    render(<PriceLabel avgCheck={null} />);

    const unknownEl = screen.getByText('чек не уточнено');
    expect(unknownEl).toHaveAttribute('data-price-status', 'unknown');
  });
});
