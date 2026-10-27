import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEMO_RECOGNIZED_LINK, DEMO_UNKNOWN_LINK, placesFixture } from '@/shared/api';

import { CandidateListView } from './candidate-list-view';
import { LinkInputForm } from './link-input-form';
import { ResolveLoadingView } from './resolve-loading-view';

describe('resolve-link UI components', () => {
  it('renders LinkInputForm with demo links and triggers submit', () => {
    const onUrlChange = vi.fn();
    const onSubmitUrl = vi.fn();
    const onSwitchToSearch = vi.fn();

    render(
      <LinkInputForm
        url=""
        onUrlChange={onUrlChange}
        onSubmitUrl={onSubmitUrl}
        onSwitchToSearch={onSwitchToSearch}
        showDemoLinks
      />,
    );

    const coffeeDemoBtn = screen.getByRole('button', { name: 'Пример: кофейня' });
    const unknownDemoBtn = screen.getByRole('button', { name: 'Пример: не распознаётся' });
    expect(coffeeDemoBtn).toBeInTheDocument();
    expect(unknownDemoBtn).toBeInTheDocument();

    fireEvent.click(coffeeDemoBtn);
    expect(onUrlChange).toHaveBeenCalledWith(DEMO_RECOGNIZED_LINK);
    expect(onSubmitUrl).toHaveBeenCalledWith(DEMO_RECOGNIZED_LINK);

    fireEvent.click(unknownDemoBtn);
    expect(onUrlChange).toHaveBeenCalledWith(DEMO_UNKNOWN_LINK);
    expect(onSubmitUrl).toHaveBeenCalledWith(DEMO_UNKNOWN_LINK);
  });

  it('renders ResolveLoadingView with 1/3-3/3 steps and slow hint after 5s', () => {
    const onCancel = vi.fn();
    const onSwitchToSearch = vi.fn();

    const { rerender } = render(
      <ResolveLoadingView
        loadingStep={2}
        isSlow={false}
        onCancel={onCancel}
        onSwitchToSearch={onSwitchToSearch}
      />,
    );

    expect(screen.getByText('Смотрим ролик…')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(screen.queryByText(/Долго думаем/)).not.toBeInTheDocument();

    rerender(
      <ResolveLoadingView
        loadingStep={3}
        isSlow
        onCancel={onCancel}
        onSwitchToSearch={onSwitchToSearch}
      />,
    );

    expect(
      screen.getByText('Долго думаем. Подождём ещё или найдём по названию?'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Найти по названию' }));
    expect(onSwitchToSearch).toHaveBeenCalledTimes(1);
  });

  it('renders CandidateListView with exactly one primary button and handles alreadySaved state', () => {
    const first = placesFixture[0];
    const second = placesFixture[1];
    const third = placesFixture[2];
    if (!first || !second || !third) {
      throw new Error('Missing fixture places');
    }

    const onSavePlace = vi.fn();
    const onOpenPlace = vi.fn();
    const onSearchByName = vi.fn();

    render(
      <CandidateListView
        sourceUrl="https://vt.tiktok.com/ZS8kQ2pLm"
        candidates={[
          { place: first, confidence: 0.95 },
          { place: second, confidence: 0.72 },
          { place: third, confidence: 0.45 },
        ]}
        savedPlaceIds={new Set([first.id])}
        onSavePlace={onSavePlace}
        onOpenPlace={onOpenPlace}
        onSearchByName={onSearchByName}
        onBack={() => undefined}
      />,
    );

    expect(screen.getByText('Это оно?')).toBeInTheDocument();
    expect(screen.getByText('vt.tiktok.com/ZS8kQ2pLm')).toBeInTheDocument();

    // First candidate is already saved -> "Уже в твоих местах" + "Открыть"
    expect(screen.getByText('Уже в твоих местах')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(onOpenPlace).toHaveBeenCalledWith(first);

    // Second candidate becomes the single primary -> "Да, сохранить"
    fireEvent.click(screen.getByRole('button', { name: 'Да, сохранить' }));
    expect(onSavePlace).toHaveBeenCalledWith(second);

    // Third candidate is secondary -> "Это"
    fireEvent.click(screen.getByRole('button', { name: 'Это' }));
    expect(onSavePlace).toHaveBeenCalledWith(third);

    // Reject all -> "Не то. Найти по названию"
    fireEvent.click(screen.getByRole('button', { name: 'Не то. Найти по названию' }));
    expect(onSearchByName).toHaveBeenCalledTimes(1);
  });
});
