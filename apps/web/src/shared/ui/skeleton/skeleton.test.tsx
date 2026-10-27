import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlaceRowSkeleton, Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders static bg-line blocks without looping animation', () => {
    render(
      <div>
        <Skeleton width={200} height={120} />
        <PlaceRowSkeleton />
      </div>,
    );

    const rect = screen.getByTestId('skeleton');
    expect(rect).toHaveClass('bg-line');
    expect(rect).toHaveAttribute('aria-hidden', 'true');
    expect(rect).toHaveStyle({ width: '200px', height: '120px' });

    const row = screen.getByTestId('skeleton-place-row');
    expect(row).toHaveAttribute('aria-hidden', 'true');
  });
});
