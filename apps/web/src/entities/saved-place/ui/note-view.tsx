import type { SavedPlace } from '@where-is-hype/core';
import { MAX_NOTE_LENGTH } from '@where-is-hype/core';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

import { Button } from '@/shared/ui/button';

export interface NoteViewProps extends HTMLAttributes<HTMLDivElement> {
  note?: string | null | undefined;
  value?: string | null | undefined;
  savedPlace?: Pick<SavedPlace, 'note'> | null | undefined;
  maxLength?: number | undefined;
  showCount?: boolean | undefined;
  placeholder?: string | undefined;
  handwritten?: boolean | undefined;
  onEdit?: (() => void) | undefined;
  editLabel?: string | undefined;
}

export function NoteView({
  note,
  value,
  savedPlace,
  maxLength = MAX_NOTE_LENGTH,
  showCount = true,
  placeholder = 'Заметки пока нет',
  handwritten = false,
  onEdit,
  editLabel,
  className,
  ...rest
}: NoteViewProps) {
  const rawNote = note ?? value ?? savedPlace?.note ?? '';
  const trimmedNote = rawNote.trim();
  const hasNote = trimmedNote.length > 0;

  return (
    <div
      data-note-state={hasNote ? 'filled' : 'empty'}
      className={clsx(
        'flex flex-col gap-1.5 rounded-sm border-[1.5px] border-dashed border-line bg-surface px-4 py-3 text-ink',
        className,
      )}
      {...rest}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] leading-4 text-ink-muted">Моя заметка</span>
        {onEdit && (
          <Button
            variant="text"
            onClick={onEdit}
            className="min-h-7 px-1.5 py-0.5 text-xs font-medium"
          >
            {editLabel ?? (hasNote ? 'Изменить' : 'Добавить')}
          </Button>
        )}
      </div>

      {hasNote ? (
        <p
          data-testid="note-view-text"
          className={clsx(
            'm-0 wrap-break-word',
            handwritten
              ? 'font-hand text-2xl leading-[1.1] text-ink'
              : 'font-ui text-[15px] leading-5 text-ink',
          )}
        >
          {rawNote}
        </p>
      ) : (
        <p data-testid="note-view-empty" className="m-0 font-ui text-sm leading-5 text-ink-muted">
          {placeholder}
        </p>
      )}

      {showCount && (
        <span
          data-testid="note-view-counter"
          className="self-end font-mono text-[11px] leading-4 text-ink-muted"
        >
          {rawNote.length}/{maxLength}
        </span>
      )}
    </div>
  );
}
