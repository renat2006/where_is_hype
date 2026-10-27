import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NoteView } from './note-view';

describe('NoteView', () => {
  it('renders note text and mono character counter', () => {
    const note = 'взять раф с халвой, сесть у окна';
    render(<NoteView note={note} />);

    expect(screen.getByText('Моя заметка')).toBeInTheDocument();
    expect(screen.getByTestId('note-view-text')).toHaveTextContent(note);

    const counter = screen.getByTestId('note-view-counter');
    expect(counter).toHaveTextContent('32/280');
    expect(counter).toHaveClass('font-mono');
  });

  it('renders empty state placeholder and supports edit callback', () => {
    const onEdit = vi.fn();
    render(<NoteView note="" onEdit={onEdit} />);

    expect(screen.getByTestId('note-view-empty')).toHaveTextContent('Заметки пока нет');
    expect(screen.getByTestId('note-view-counter')).toHaveTextContent('0/280');

    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
