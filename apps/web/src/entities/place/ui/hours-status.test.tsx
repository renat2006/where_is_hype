import { render, screen } from '@testing-library/react';
import type { WeeklyHours } from '@where-is-hype/core';
import { describe, expect, it } from 'vitest';

import { HoursStatus } from './hours-status';

const sampleHours: WeeklyHours = {
  mon: { open: '10:00', close: '22:00' },
  tue: { open: '10:00', close: '22:00' },
  wed: { open: '10:00', close: '22:00' },
  thu: { open: '10:00', close: '22:00' },
  fri: { open: '10:00', close: '23:00' },
  sat: { open: '12:00', close: '23:00' },
  sun: null,
};

describe('HoursStatus', () => {
  it('renders open state with text, icon, and mono time', () => {
    const { container } = render(<HoursStatus status={{ kind: 'open', until: '23:00' }} />);

    const badge = container.firstElementChild;
    expect(badge).toHaveAttribute('data-status-kind', 'open');
    expect(badge).toHaveClass('bg-status-open');
    expect(badge).toHaveTextContent('Открыто до 23:00');
    expect(screen.getByText('23:00')).toHaveClass('font-mono');
    expect(badge?.querySelector('[data-status-icon="open"]')).toBeInTheDocument();
  });

  it('renders closed state with text, icon, and mono opening time', () => {
    const { container } = render(<HoursStatus status={{ kind: 'closed', opensAt: '12:00' }} />);

    const badge = container.firstElementChild;
    expect(badge).toHaveAttribute('data-status-kind', 'closed');
    expect(badge).toHaveClass('bg-status-closed');
    expect(badge).toHaveTextContent('Закрыто, откроется в 12:00');
    expect(screen.getByText('12:00')).toHaveClass('font-mono');
    expect(badge?.querySelector('[data-status-icon="closed"]')).toBeInTheDocument();
  });

  it('renders unknown state with dashed border, text, and icon', () => {
    const { container } = render(<HoursStatus status={{ kind: 'unknown' }} />);

    const badge = container.firstElementChild;
    expect(badge).toHaveAttribute('data-status-kind', 'unknown');
    expect(badge).toHaveClass('border-dashed');
    expect(screen.getByText('Часы не уточнены')).toBeInTheDocument();
    expect(badge?.querySelector('[data-status-icon="unknown"]')).toBeInTheDocument();
  });

  it('computes status from weekly hours and date or falls back to unknown when null', () => {
    const { rerender } = render(
      <HoursStatus hours={sampleHours} at={new Date('2026-10-26T12:00:00.000Z')} />,
    );
    expect(screen.getByText('22:00')).toHaveClass('font-mono');

    rerender(<HoursStatus hours={null} />);
    expect(screen.getByText('Часы не уточнены')).toBeInTheDocument();
  });
});
