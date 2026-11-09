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

  it('displays confidence badge, evidence source («речь», «текст на экране», «подпись», «кадры»), quote, and source video link', () => {
    const { rerender } = render(
      <CandidateCard
        candidate={{
          place: samplePlace,
          confidence: 0.94,
          matchStatus: 'exact',
          evidence: 'speech',
          evidenceQuote: 'сегодня ужинаем в ресторане Сосны',
        }}
        sourceUrl="https://vt.tiktok.com/ZS8kQ2pLm"
      />,
    );

    expect(screen.getByTestId('candidate-confidence')).toHaveTextContent(
      'Высокая уверенность · точное совпадение',
    );
    expect(screen.getByTestId('candidate-evidence')).toHaveTextContent('Источник: речь');
    expect(screen.getByTestId('candidate-evidence')).toHaveTextContent(
      '«сегодня ужинаем в ресторане Сосны»',
    );
    expect(screen.getByTestId('candidate-source-link')).toHaveAttribute(
      'href',
      'https://vt.tiktok.com/ZS8kQ2pLm',
    );

    rerender(
      <CandidateCard
        candidate={{
          place: samplePlace,
          confidence: 0.72,
          matchStatus: 'ambiguous',
          evidence: 'on_screen_text',
          evidenceQuote: 'Сосны на Большой Никитской',
        }}
      />,
    );
    expect(screen.getByTestId('candidate-confidence')).toHaveTextContent(
      'Средняя уверенность · проверьте адрес',
    );
    expect(screen.getByTestId('candidate-evidence')).toHaveTextContent('Источник: текст на экране');

    rerender(
      <CandidateCard
        candidate={{
          place: samplePlace,
          confidence: 0.45,
          matchStatus: 'ambiguous',
          evidence: 'caption',
          evidenceQuote: 'Локация в подписи',
        }}
      />,
    );
    expect(screen.getByTestId('candidate-confidence')).toHaveTextContent(
      'Низкая уверенность · возможный вариант',
    );
    expect(screen.getByTestId('candidate-evidence')).toHaveTextContent('Источник: подпись');
  });

  it('hides address, metro, and hours when they are missing in place data', () => {
    const placeWithoutDetails: Place = {
      ...samplePlace,
      address: '',
      metro: { name: '', distanceM: 0 },
      hours: null,
    };

    render(<CandidateCard candidate={{ place: placeWithoutDetails, confidence: 0.9 }} />);

    expect(screen.getByText('Сосны')).toBeInTheDocument();
    expect(screen.getByText('Ресторан')).toBeInTheDocument();
    expect(screen.queryByText(/м\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/Часы не уточнены/)).not.toBeInTheDocument();
  });

  it('renders chain_ambiguous state with branch selection or "Ближайший филиал" and confirms with "Да, сохранить"', () => {
    const onSave = vi.fn();
    const branchA: Place = {
      ...samplePlace,
      id: 'surf-pokrovka',
      name: 'Surf Coffee × Pokrovka',
      type: 'coffee',
      address: 'ул. Покровка, 17',
      metro: { name: 'Чистые пруды', distanceM: 420 },
    };
    const branchB: Place = {
      ...samplePlace,
      id: 'surf-solyanka',
      name: 'Surf Coffee × Solyanka',
      type: 'coffee',
      address: 'ул. Солянка, 1/2',
      metro: { name: 'Китай-город', distanceM: 210 },
    };

    render(
      <CandidateCard
        candidate={{
          place: null,
          confidence: 0.4,
          matchStatus: 'chain_ambiguous',
          isChain: true,
          extractedName: 'Surf Coffee',
          evidence: 'frame',
          evidenceQuote: 'Стаканчик Surf Coffee в кадре',
          branchCandidates: [branchA, branchB],
        }}
        onSave={onSave}
      />,
    );

    expect(screen.getByTestId('candidate-confidence')).toHaveTextContent(
      'Сеть без адреса · выберите филиал',
    );
    expect(screen.getByTestId('candidate-evidence')).toHaveTextContent('Источник: кадры');
    expect(screen.getByTestId('candidate-evidence')).toHaveTextContent(
      '«Стаканчик Surf Coffee в кадре»',
    );

    // By default "Ближайший филиал" is active -> branchB has smaller metro distanceM (210m vs 420m)
    fireEvent.click(screen.getByRole('button', { name: 'Да, сохранить' }));
    expect(onSave).toHaveBeenCalledWith(branchB);

    // Selecting specific branchA and confirming with "Да, сохранить"
    fireEvent.click(screen.getByRole('button', { name: /Surf Coffee × Pokrovka/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, сохранить' }));
    expect(onSave).toHaveBeenLastCalledWith(branchA);
  });

  it('renders honest not_found state with closed video hint ("пришли видео файлом")', () => {
    const onSearchByName = vi.fn();

    render(
      <CandidateCard
        candidate={{
          place: null,
          confidence: 0.2,
          matchStatus: 'not_found',
          extractedName: 'Кафе Атлантида',
          evidence: 'speech',
          evidenceQuote: 'секретное Кафе Атлантида',
          branchCandidates: [],
        }}
        onSearchByName={onSearchByName}
      />,
    );

    expect(screen.getByTestId('candidate-confidence')).toHaveTextContent('Не нашли в базе');
    expect(screen.getByText(/пришли видео файлом/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Найти по названию' }));
    expect(onSearchByName).toHaveBeenCalledWith('Кафе Атлантида');
  });
});
