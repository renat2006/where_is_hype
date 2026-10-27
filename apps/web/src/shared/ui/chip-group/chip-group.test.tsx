import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChipGroup } from './chip-group';
import {
  getEveningHourOptions,
  PLACE_TYPE_CHIP_OPTIONS,
  PRICE_CHIP_OPTIONS,
} from './chip-group-options';

describe('ChipGroup', () => {
  it('supports single selection for hour and price pickers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function ControlledSingle() {
      const [val, setVal] = useState<string>('19:00');
      return (
        <ChipGroup
          ariaLabel="Открыто в"
          options={getEveningHourOptions(17)}
          value={val}
          onChange={(next) => {
            setVal(next);
            onChange(next);
          }}
        />
      );
    }

    render(<ControlledSingle />);

    const chip19 = screen.getByRole('button', { name: '19:00' });
    const chip21 = screen.getByRole('button', { name: '21:00' });

    expect(chip19).toHaveAttribute('aria-pressed', 'true');
    expect(chip21).toHaveAttribute('aria-pressed', 'false');

    await user.click(chip21);
    expect(onChange).toHaveBeenCalledWith('21:00');
    expect(chip21).toHaveAttribute('aria-pressed', 'true');
    expect(chip19).toHaveAttribute('aria-pressed', 'false');
  });

  it('supports multiple selection for place types (toggle on/off)', async () => {
    const user = userEvent.setup();

    function ControlledMulti() {
      const [selected, setSelected] = useState<string[]>(['cafe']);
      return (
        <ChipGroup
          multiple
          ariaLabel="Тип места"
          options={PLACE_TYPE_CHIP_OPTIONS}
          value={selected}
          onChange={setSelected}
        />
      );
    }

    render(<ControlledMulti />);

    const cafeBtn = screen.getByRole('button', { name: 'Кафе' });
    const restBtn = screen.getByRole('button', { name: 'Ресторан' });
    const barBtn = screen.getByRole('button', { name: 'Бар' });

    expect(cafeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(restBtn).toHaveAttribute('aria-pressed', 'false');

    await user.click(restBtn);
    expect(cafeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(restBtn).toHaveAttribute('aria-pressed', 'true');

    await user.click(cafeBtn);
    expect(cafeBtn).toHaveAttribute('aria-pressed', 'false');
    expect(restBtn).toHaveAttribute('aria-pressed', 'true');

    await user.click(barBtn);
    expect(barBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('supports keyboard navigation with ArrowRight and ArrowLeft in single mode', async () => {
    const user = userEvent.setup();

    function ControlledPrice() {
      const [price, setPrice] = useState<string>('any');
      return (
        <ChipGroup ariaLabel="Чек" options={PRICE_CHIP_OPTIONS} value={price} onChange={setPrice} />
      );
    }

    render(<ControlledPrice />);

    const anyBtn = screen.getByRole('button', { name: 'Любой' });
    anyBtn.focus();
    await user.keyboard('{ArrowRight}');

    const btn1000 = screen.getByRole('button', { name: /1000/ });
    expect(btn1000).toHaveFocus();
    expect(btn1000).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(anyBtn).toHaveFocus();
    expect(anyBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
