import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TextField } from './text-field';

describe('TextField', () => {
  it('renders link field with error note and clear button', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    const { rerender } = render(
      <TextField
        variant="link"
        label="Ссылка на ролик"
        value="vt.tiktok.com/ZS8kQ2pLm"
        onChange={() => undefined}
        onClear={onClear}
      />,
    );

    const clearBtn = screen.getByRole('button', { name: 'Очистить' });
    await user.click(clearBtn);
    expect(onClear).toHaveBeenCalledTimes(1);

    rerender(
      <TextField
        variant="link"
        label="Ссылка на ролик"
        value="instagram.com/p/private"
        onChange={() => undefined}
        error="Ролик закрыт. Напиши название места, найдём сами."
      />,
    );

    const input = screen.getByLabelText('Ссылка на ролик');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ролик закрыт. Напиши название места, найдём сами.',
    );
  });

  it('renders search field with suggestions, single-char hint, and report missing action', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onReport = vi.fn();

    const { rerender } = render(
      <TextField variant="search" value="Ж" onChange={() => undefined} />,
    );
    expect(screen.getByText('Набери ещё букву')).toBeInTheDocument();

    rerender(
      <TextField
        variant="search"
        value="Жу"
        onChange={() => undefined}
        suggestions={[
          { id: '1', title: 'Журавли', subtitle: 'Бар · Покровка, 17 · Китай-город' },
          { id: '2', title: 'Жук и Пчела', subtitle: 'Кофейня · Мясницкая, 24 · Чистые пруды' },
        ]}
        onSelectSuggestion={onSelect}
        onReportMissing={onReport}
      />,
    );

    expect(screen.getByRole('listbox', { name: 'Подсказки' })).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    const secondOption = options[1];
    expect(secondOption).toBeDefined();
    if (secondOption) {
      await user.click(secondOption);
    }
    expect(onSelect).toHaveBeenCalledWith({
      id: '2',
      title: 'Жук и Пчела',
      subtitle: 'Кофейня · Мясницкая, 24 · Чистые пруды',
    });

    await user.click(screen.getByRole('button', { name: 'Сообщить' }));
    expect(onReport).toHaveBeenCalledTimes(1);
  });
});
