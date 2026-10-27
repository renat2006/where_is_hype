import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { UiKitPage } from './ui-kit-page';

describe('UiKitPage', () => {
  it('renders all shared/ui sections and switches theme between day and night', async () => {
    const user = userEvent.setup();
    render(<UiKitPage />);

    expect(screen.getByRole('heading', { name: 'UI-кит' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Кнопки' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Чипсы и фильтры' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Поля ввода' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Шторка и друзья' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Обратная связь' })).toBeInTheDocument();

    const nightRadio = screen.getByRole('radio', { name: 'Ночь' });
    await user.click(nightRadio);
    expect(document.documentElement).toHaveAttribute('data-theme', 'night');

    const dayRadio = screen.getByRole('radio', { name: 'День' });
    await user.click(dayRadio);
    expect(document.documentElement).toHaveAttribute('data-theme', 'day');
  });
});
