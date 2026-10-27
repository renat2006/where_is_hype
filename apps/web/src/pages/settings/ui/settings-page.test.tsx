import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY } from '@/shared/lib/theme';

import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = '<meta name="theme-color" content="#F4EFE6" />';
  });

  it('switches theme between Авто, День, and Ночь', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>,
    );

    const autoRadio = screen.getByRole('radio', { name: /авто/i });
    const dayRadio = screen.getByRole('radio', { name: 'День' });
    const nightRadio = screen.getByRole('radio', { name: 'Ночь' });

    expect(autoRadio).toHaveAttribute('aria-checked', 'true');

    await user.click(nightRadio);
    expect(nightRadio).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('night');
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');

    await user.click(dayRadio);
    expect(dayRadio).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('day');
    expect(document.documentElement.getAttribute('data-theme')).toBe('day');
  });
});
