import { MAX_NOTE_LENGTH } from '@where-is-hype/core';

export { MAX_NOTE_LENGTH };

export function clampNote(value: string, maxLength: number = MAX_NOTE_LENGTH): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}

export function formatNoteCounter(value: string, maxLength: number = MAX_NOTE_LENGTH): string {
  return `${String(value.length)}/${String(maxLength)}`;
}
