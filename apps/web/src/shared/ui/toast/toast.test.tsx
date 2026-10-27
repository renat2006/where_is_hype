import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from './toast';
import { clearToasts, useToast } from './toast-store';

function ToastTestHarness({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
  const { showToast } = useToast();

  return (
    <ToastProvider>
      <button
        type="button"
        onClick={() => {
          showToast({
            message: 'Место удалено',
            onUndo,
            onExpire,
          });
        }}
      >
        Удалить место
      </button>
    </ToastProvider>
  );
}

describe('Toast and useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearToasts();
  });

  afterEach(() => {
    clearToasts();
    vi.useRealTimers();
  });

  it('shows 5s mono countdown and expires after 5 seconds if not cancelled', () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();

    render(<ToastTestHarness onUndo={onUndo} onExpire={onExpire} />);

    act(() => {
      screen.getByRole('button', { name: 'Удалить место' }).click();
    });

    expect(screen.getByRole('status')).toHaveTextContent('Место удалено');
    const countdown = screen.getByTestId('toast-countdown');
    expect(countdown).toHaveClass('font-mono');
    expect(countdown).toHaveTextContent('5');

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByTestId('toast-countdown')).toHaveTextContent('4');

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByTestId('toast-countdown')).toHaveTextContent('1');
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('calls onUndo and cancels expiration when "Отменить" is clicked', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onExpire = vi.fn();

    render(<ToastTestHarness onUndo={onUndo} onExpire={onExpire} />);

    await user.click(screen.getByRole('button', { name: 'Удалить место' }));
    expect(screen.getByRole('status')).toHaveTextContent('Место удалено');

    await user.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
