import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { savedPlaceSchema } from '@where-is-hype/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { apiGet, apiPost, enableMocks, resetMockState } from '@/shared/api';
import { clearToasts } from '@/shared/ui/toast';

import { DeletePlaceButton } from './delete-place-button';

describe('DeletePlaceButton feature', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  beforeEach(() => {
    clearToasts();
  });

  afterEach(() => {
    clearToasts();
    resetMockState();
    vi.useRealTimers();
  });

  it('shows 5s toast "Место удалено · Отменить" and cancels deletion when Undo is clicked', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onDeleted = vi.fn();

    await apiPost('/me/places', savedPlaceSchema, {
      placeId: 'sosny',
    });

    render(<DeletePlaceButton placeId="sosny" onUndo={onUndo} onDeleted={onDeleted} />);

    await user.click(screen.getByRole('button', { name: 'Удалить место' }));

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Место удалено');
    expect(screen.getByTestId('toast-countdown')).toHaveTextContent('5');

    await user.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(onUndo).toHaveBeenCalledWith('sosny');
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    const list = await apiGet('/me/places', z.array(savedPlaceSchema));
    expect(list).toHaveLength(1);
    expect(list[0]?.place.id).toBe('sosny');
  });

  it('deletes the place after 5 seconds when not cancelled', async () => {
    await apiPost('/me/places', savedPlaceSchema, {
      placeId: 'sosny',
    });

    vi.useFakeTimers();
    const onDeleted = vi.fn();

    render(<DeletePlaceButton placeId="sosny" onDeleted={onDeleted} />);

    act(() => {
      screen.getByRole('button', { name: 'Удалить место' }).click();
    });

    expect(screen.getByRole('status')).toHaveTextContent('Место удалено');
    expect(screen.getByTestId('toast-countdown')).toHaveTextContent('5');

    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.getByTestId('toast-countdown')).toHaveTextContent('1');
    expect(onDeleted).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_050);
    });

    expect(onDeleted).toHaveBeenCalledWith('sosny');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    vi.useRealTimers();

    await waitFor(async () => {
      const list = await apiGet('/me/places', z.array(savedPlaceSchema));
      expect(list).toHaveLength(0);
    });
  });
});
