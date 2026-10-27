import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GeoOriginPicker } from './geo-origin-picker';

describe('GeoOriginPicker', () => {
  it('renders screen 08 stations, updates CTA label on radio selection, and confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onRequestGeolocation = vi.fn();

    render(<GeoOriginPicker onConfirm={onConfirm} onRequestGeolocation={onRequestGeolocation} />);

    expect(screen.getByRole('heading', { name: 'От какого метро считать?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Считать от «Чистых прудов»' })).toBeInTheDocument();

    const tverskayaRadio = screen.getByRole('radio', { name: /Тверская/i });
    await user.click(tverskayaRadio);

    expect(tverskayaRadio).toHaveAttribute('aria-checked', 'true');
    const confirmBtn = screen.getByRole('button', { name: 'Считать от «Тверской»' });
    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith('tverskaya');

    await user.click(screen.getByRole('button', { name: 'Разрешить геолокацию' }));
    expect(onRequestGeolocation).toHaveBeenCalledTimes(1);
  });

  it('filters stations by search input', async () => {
    const user = userEvent.setup();

    render(<GeoOriginPicker />);

    const searchInput = screen.getByRole('textbox', { name: 'Станция метро' });
    await user.type(searchInput, 'Маяковская');

    expect(screen.getByRole('radio', { name: /Маяковская/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Чистые пруды/i })).not.toBeInTheDocument();
  });
});
