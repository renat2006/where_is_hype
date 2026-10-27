import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { defaultEveningFilter } from '@/features/evening-filter/model/evening-filter-model';

import { EveningFilterEmpty } from './evening-filter-empty';
import { EveningFilterSheet } from './evening-filter-sheet';

describe('EveningFilter UI (Screens 09–10)', () => {
  const now = new Date('2026-10-27T17:15:00+03:00');

  it('renders Screen 09 filter sheet with live count "Показать N из M" and updates controls', () => {
    const onUpdate = vi.fn();
    const onReset = vi.fn();
    const onApply = vi.fn();

    render(
      <EveningFilterSheet
        filter={{
          at: 19,
          types: ['cafe', 'rest'],
          maxCheck: 2500,
          nearMetro: true,
        }}
        matchedCount={3}
        totalCount={7}
        now={now}
        onUpdate={onUpdate}
        onReset={onReset}
        onApply={onApply}
      />,
    );

    expect(screen.getByRole('heading', { name: 'На вечер' })).toBeInTheDocument();
    expect(
      screen.getByText('Места без часов или чека не прячем, а помечаем «не уточнено».'),
    ).toBeInTheDocument();

    const submitBtn = screen.getByTestId('evening-filter-submit');
    expect(submitBtn).toHaveTextContent('Показать 3 из 7');

    expect(screen.getByRole('button', { name: '19:00' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Кафе' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ресторан' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: '21:00' }));
    expect(onUpdate).toHaveBeenCalledWith({ at: 21 });

    fireEvent.click(screen.getByRole('button', { name: 'Бар' }));
    expect(onUpdate).toHaveBeenCalledWith({ types: ['cafe', 'rest', 'bar'] });

    fireEvent.click(screen.getByRole('button', { name: /до 1500 ₽/i }));
    expect(onUpdate).toHaveBeenCalledWith({ maxCheck: 1500 });

    fireEvent.click(screen.getByRole('switch', { name: /Рядом с метро/i }));
    expect(onUpdate).toHaveBeenCalledWith({ nearMetro: false });

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(onReset).toHaveBeenCalledTimes(1);

    fireEvent.click(submitBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('renders Screen 10 empty filter state with relaxation chips and reset button', () => {
    const onSelectRelaxation = vi.fn();
    const onReset = vi.fn();

    const relaxations = [
      {
        id: 'without-check',
        label: 'Без «до 1000 ₽»',
        count: 2,
        filter: { ...defaultEveningFilter, at: 23, types: ['bar' as const], nearMetro: true },
      },
      {
        id: 'at-21',
        label: 'В 21:00',
        count: 1,
        filter: {
          ...defaultEveningFilter,
          at: 21 as const,
          types: ['bar' as const],
          maxCheck: 1000,
          nearMetro: true,
        },
      },
    ];

    render(
      <EveningFilterEmpty
        filter={{
          at: 23,
          types: ['bar'],
          maxCheck: 1000,
          nearMetro: true,
        }}
        relaxations={relaxations}
        onSelectRelaxation={onSelectRelaxation}
        onReset={onReset}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ничего не подошло' })).toBeInTheDocument();
    expect(screen.getByTestId('evening-filter-empty-sheet')).toHaveTextContent(
      'В 23:00 бар до 1000 ₽ у метро не нашёлся. Сбросить фильтры?',
    );

    const relaxChip = screen.getByRole('button', { name: /Без «до 1000 ₽» · 2/i });
    fireEvent.click(relaxChip);
    expect(onSelectRelaxation).toHaveBeenCalledWith(relaxations[0]);

    const resetBtn = screen.getByRole('button', { name: 'Сбросить фильтры' });
    fireEvent.click(resetBtn);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
