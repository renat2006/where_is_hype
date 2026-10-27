import { QueryClient, QueryClientContext, useQueryClient } from '@tanstack/react-query';
import type { Place, SavedPlace } from '@where-is-hype/core';
import { MAX_NOTE_LENGTH } from '@where-is-hype/core';
import clsx from 'clsx';
import { type ChangeEvent, type KeyboardEvent, useContext, useId, useState } from 'react';

import {
  NoteView,
  savedPlaceQueries,
  savePlace,
  updateSavedPlaceNote,
} from '@/entities/saved-place';
import { Button } from '@/shared/ui/button';

import { clampNote, formatNoteCounter } from './edit-note-utils';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});

export interface EditNoteProps {
  placeId?: string | undefined;
  note?: string | null | undefined;
  initialNote?: string | null | undefined;
  savedPlace?: (Pick<SavedPlace, 'note'> & { place?: Pick<Place, 'id'> }) | null | undefined;
  maxLength?: number | undefined;
  defaultEditing?: boolean | undefined;
  placeholder?: string | undefined;
  onSave?: ((note: string) => void | Promise<void>) | undefined;
  onCancel?: (() => void) | undefined;
  className?: string | undefined;
}

export function EditNote({
  placeId,
  note,
  initialNote,
  savedPlace,
  maxLength = MAX_NOTE_LENGTH,
  defaultEditing = false,
  placeholder = 'Заметки пока нет',
  onSave,
  onCancel,
  className,
}: EditNoteProps) {
  const contextQueryClient = useContext(QueryClientContext);
  const queryClient = useQueryClient(contextQueryClient ?? fallbackQueryClient);
  const textareaId = useId();

  const resolvedPlaceId = placeId ?? savedPlace?.place?.id;
  const externalNote = clampNote(note ?? initialNote ?? savedPlace?.note ?? '', maxLength);
  const syncKey = `${resolvedPlaceId ?? ''}:${externalNote}`;

  const [savedOverride, setSavedOverride] = useState<{ key: string; value: string } | null>(null);
  const currentNote = savedOverride?.key === syncKey ? savedOverride.value : externalNote;

  const [draft, setDraft] = useState<string>(externalNote);
  const [isEditing, setIsEditing] = useState<boolean>(defaultEditing);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const handleStartEdit = () => {
    setDraft(currentNote);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraft(currentNote);
    setIsEditing(false);
    onCancel?.();
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(clampNote(event.target.value, maxLength));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }
  };

  const handleSave = async () => {
    const nextNote = clampNote(draft.trim(), maxLength);
    setIsSaving(true);
    setSavedOverride({ key: syncKey, value: nextNote });
    setDraft(nextNote);
    setIsEditing(false);

    try {
      await onSave?.(nextNote);

      if (resolvedPlaceId) {
        queryClient.setQueryData<SavedPlace[]>(savedPlaceQueries.list().queryKey, (previous) => {
          if (!previous) {
            return previous;
          }
          return previous.map((item) =>
            item.place.id === resolvedPlaceId ? { ...item, note: nextNote } : item,
          );
        });

        try {
          await updateSavedPlaceNote({ placeId: resolvedPlaceId, note: nextNote });
        } catch {
          try {
            await savePlace({ placeId: resolvedPlaceId, note: nextNote });
          } catch {
            // Keep optimistic local note when running without backend/MSW
          }
        }

        await queryClient.invalidateQueries({ queryKey: savedPlaceQueries.all() });
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <NoteView
        note={currentNote}
        maxLength={maxLength}
        showCount
        handwritten={false}
        placeholder={placeholder}
        onEdit={handleStartEdit}
        className={className}
      />
    );
  }

  return (
    <div
      data-note-state="editing"
      className={clsx(
        'flex flex-col gap-2.5 rounded-sm border-[1.5px] border-dashed border-line bg-surface px-4 py-3 text-ink',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={textareaId} className="text-[0.8125rem] leading-4 text-ink-muted">
          Моя заметка
        </label>
        <span
          data-testid="note-view-counter"
          className="font-mono text-[0.6875rem] leading-4 text-ink-muted"
        >
          {formatNoteCounter(draft, maxLength)}
        </span>
      </div>

      <textarea
        id={textareaId}
        aria-label="Моя заметка"
        rows={3}
        maxLength={maxLength}
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Что важно запомнить про место?"
        className="box-border w-full resize-none rounded-md border-[1.5px] border-ink bg-surface px-3.5 py-2.5 font-ui text-[1rem] leading-6 text-ink placeholder:text-ink-muted focus-visible:outline-[2.5px] focus-visible:outline-offset-[2px] focus-visible:outline-ink"
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="text"
          onClick={handleCancel}
          disabled={isSaving}
          className="min-h-[2.75rem] px-3 py-1.5 text-[0.875rem]"
        >
          Отмена
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            void handleSave();
          }}
          loading={isSaving}
          loadingLabel="Сохраняем"
          className="min-h-[2.75rem] px-4 py-1.5 text-[0.875rem]"
        >
          Сохранить
        </Button>
      </div>
    </div>
  );
}
