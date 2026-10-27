import { fireEvent, render, screen } from '@testing-library/react';
import type { Place } from '@where-is-hype/core';
import { describe, expect, it, vi } from 'vitest';

import { CandidateCard } from './candidate-card';

const samplePlace: Place = {
  id: 'sosny',
  name: 'Сосны',
  type: 'rest',
  address: 'Большая Никитская, 12',
  metro: { name: 'Охотный Ряд', distanceM: 450 },
  location: { lat: 55.7572, lng: 37.6151 },
  hours: null,
  avgCheck: 2500,
  yandexOrgId: null,
};

describe('CandidateCard', () => {
  it('renders primary candidate with address, metro, mono distance, counter, and actions', () => {
    const onSave = vi.fn();
    const onReject = vi.fn();

    render(
      <CandidateCard
        candidate={{ place: samplePlace, confidence: 0.92 }}
        index={1}
        total={3}
        onSave={onSave}
        onReject={onReject}
      />,
    );

    expect(screen.getByText('Сосны')).toBeInTheDocument();
    expect(screen.getByText(/Ресторан · Большая Никитская, 12/)).toBeInTheDocument();
    expect(screen.getByText('450 м')).toHaveClass('font-mono');
    expect(screen.getByText('1/3')).toHaveClass('font-mono');

    fireEvent.click(screen.getByRole('button', { name: 'Да, сохранить' }));
    expect(onSave).toHaveBeenCalledWith(samplePlace);

    fireEvent.click(screen.getByRole('button', { name: 'Не то' }));
    expect(onReject).toHaveBeenCalledWith(samplePlace);
  });

  it('renders secondary and alreadySaved states', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<CandidateCard place={samplePlace} isPrimary={false} />);

    expect(screen.getByRole('button', { name: 'Это' })).toBeInTheDocument();

    rerender(<CandidateCard place={samplePlace} alreadySaved onOpen={onOpen} />);
    expect(screen.getByText('Уже в твоих местах')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(onOpen).toHaveBeenCalledWith(samplePlace);
  });
});
