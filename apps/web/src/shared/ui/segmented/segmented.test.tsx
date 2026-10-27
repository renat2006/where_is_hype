import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ThemeMode } from '@/shared/lib/theme';

import { Segmented } from './segmented';

describe('Segmented', () => {
  it('renders Авто · День · Ночь options and supports click and arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function ControlledThemeSegmented() {
      const [mode, setMode] = useState<ThemeMode>('auto');
      return (
        <Segmented
          value={mode}
          onChange={(next) => {
            setMode(next);
            onChange(next);
          }}
        />
      );
    }

    render(<ControlledThemeSegmented />);

    const autoRadio = screen.getByRole('radio', { name: 'Авто · по закату' });
    const dayRadio = screen.getByRole('radio', { name: 'День' });
    const nightRadio = screen.getByRole('radio', { name: 'Ночь' });

    expect(autoRadio).toHaveAttribute('aria-checked', 'true');
    expect(dayRadio).toHaveAttribute('aria-checked', 'false');

    await user.click(dayRadio);
    expect(onChange).toHaveBeenLastCalledWith('day');
    expect(dayRadio).toHaveAttribute('aria-checked', 'true');

    dayRadio.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('night');
    expect(nightRadio).toHaveAttribute('aria-checked', 'true');
    expect(nightRadio).toHaveFocus();
  });
});
