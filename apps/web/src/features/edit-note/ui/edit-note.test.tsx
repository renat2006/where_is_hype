import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { savedPlaceSchema } from '@where-is-hype/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { apiGet, apiPost, enableMocks, resetMockState } from '@/shared/api';

import { EditNote } from './edit-note';
import { clampNote, formatNoteCounter, MAX_NOTE_LENGTH } from './edit-note-utils';

describe('EditNote feature', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    resetMockState();
  });

  it('clamps note to 280 chars and formats counter in mono', () => {
    const longText = 'а'.repeat(310);
    const clamped = clampNote(longText);
    expect(clamped).toHaveLength(MAX_NOTE_LENGTH);
    expect(formatNoteCounter(clamped)).toBe('280/280');
  });

  it('switches to edit mode, updates counter live, and saves updated note via API', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    await apiPost('/me/places', savedPlaceSchema, {
      placeId: 'sosny',
      note: 'столик у окна',
    });

    render(<EditNote placeId="sosny" note="столик у окна" onSave={onSave} />);

    expect(screen.getByTestId('note-view-text')).toHaveTextContent('столик у окна');
    expect(screen.getByTestId('note-view-counter')).toHaveTextContent('13/280');

    await user.click(screen.getByRole('button', { name: 'Изменить' }));

    const textarea = screen.getByRole('textbox', { name: 'Моя заметка' });
    expect(textarea).toHaveValue('столик у окна');

    await user.clear(textarea);
    await user.type(textarea, 'столик у окна, брать пельмени');

    expect(screen.getByTestId('note-view-counter')).toHaveTextContent('29/280');

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith('столик у окна, брать пельмени');
    expect(screen.getByTestId('note-view-text')).toHaveTextContent('столик у окна, брать пельмени');
    expect(screen.getByTestId('note-view-counter')).toHaveTextContent('29/280');

    await waitFor(async () => {
      const list = await apiGet('/me/places', z.array(savedPlaceSchema));
      expect(list.find((item) => item.place.id === 'sosny')?.note).toBe(
        'столик у окна, брать пельмени',
      );
    });
  });

  it('enforces 280 character limit and supports cancelling edits', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<EditNote note="исходный текст" onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Изменить' }));

    const textarea = screen.getByRole('textbox', { name: 'Моя заметка' });
    fireEvent.change(textarea, { target: { value: 'х'.repeat(300) } });

    expect(textarea).toHaveValue('х'.repeat(280));
    expect(screen.getByTestId('note-view-counter')).toHaveTextContent('280/280');

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('note-view-text')).toHaveTextContent('исходный текст');
  });
});
