import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Sheet } from './sheet';

describe('Sheet', () => {
  it('renders peek (96px), half (50%), and full (calc(100% - 24px)) snap points', () => {
    const { rerender } = render(
      <Sheet snap="peek" ariaLabel="Мои места">
        <div>Контент</div>
      </Sheet>,
    );

    const region = screen.getByRole('region', { name: 'Мои места' });
    expect(region).toHaveAttribute('data-snap', 'peek');
    expect(region).toHaveStyle({ height: '96px' });

    rerender(
      <Sheet snap="half" ariaLabel="Мои места">
        <div>Контент</div>
      </Sheet>,
    );
    expect(region).toHaveAttribute('data-snap', 'half');
    expect(region).toHaveStyle({ height: '50%' });

    rerender(
      <Sheet snap="full" ariaLabel="Мои места">
        <div>Контент</div>
      </Sheet>,
    );
    expect(region).toHaveAttribute('data-snap', 'full');
    expect(region).toHaveStyle({ height: 'calc(100% - 24px)' });
  });

  it('transitions between peek, half, and full via dragging', () => {
    const onSnapChange = vi.fn();
    render(
      <Sheet defaultSnap="peek" onSnapChange={onSnapChange} ariaLabel="Шторка">
        <div>Список</div>
      </Sheet>,
    );

    const region = screen.getByRole('region', { name: 'Шторка' });
    expect(region).toHaveAttribute('data-snap', 'peek');

    // Drag up from peek -> half
    fireEvent.pointerDown(region, { clientY: 500 });
    fireEvent.pointerMove(region, { clientY: 420 });
    fireEvent.pointerUp(region, { clientY: 420 });

    expect(onSnapChange).toHaveBeenLastCalledWith('half');
    expect(region).toHaveAttribute('data-snap', 'half');

    // Drag up from half -> full
    fireEvent.pointerDown(region, { clientY: 400 });
    fireEvent.pointerMove(region, { clientY: 320 });
    fireEvent.pointerUp(region, { clientY: 320 });

    expect(onSnapChange).toHaveBeenLastCalledWith('full');
    expect(region).toHaveAttribute('data-snap', 'full');

    // Drag down from full -> half
    fireEvent.pointerDown(region, { clientY: 100 });
    fireEvent.pointerMove(region, { clientY: 180 });
    fireEvent.pointerUp(region, { clientY: 180 });

    expect(onSnapChange).toHaveBeenLastCalledWith('half');
    expect(region).toHaveAttribute('data-snap', 'half');

    // Large drag down -> peek
    fireEvent.touchStart(region, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(region, { touches: [{ clientY: 400 }] });
    fireEvent.touchEnd(region, { changedTouches: [{ clientY: 400 }] });

    expect(onSnapChange).toHaveBeenLastCalledWith('peek');
    expect(region).toHaveAttribute('data-snap', 'peek');
  });

  it('supports keyboard navigation (ArrowUp, ArrowDown, Home, End, Escape)', async () => {
    const user = userEvent.setup();
    const onSnapChange = vi.fn();
    const onClose = vi.fn();

    render(
      <Sheet defaultSnap="peek" onSnapChange={onSnapChange} onClose={onClose} ariaLabel="Шторка">
        <div>Список</div>
      </Sheet>,
    );

    const handle = screen.getByRole('button', { name: 'Изменить размер шторки' });
    const region = screen.getByRole('region', { name: 'Шторка' });

    handle.focus();
    expect(handle).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{ArrowUp}');
    expect(region).toHaveAttribute('data-snap', 'half');
    expect(handle).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{ArrowUp}');
    expect(region).toHaveAttribute('data-snap', 'full');

    await user.keyboard('{ArrowDown}');
    expect(region).toHaveAttribute('data-snap', 'half');

    await user.keyboard('{Home}');
    expect(region).toHaveAttribute('data-snap', 'full');

    await user.keyboard('{Escape}');
    expect(region).toHaveAttribute('data-snap', 'peek');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
