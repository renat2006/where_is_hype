import { type ReactNode, useSyncExternalStore } from 'react';

export const DEFAULT_TOAST_DURATION_MS = 5_000;

export interface ShowToastOptions {
  id?: string | undefined;
  message: ReactNode;
  actionLabel?: string | undefined;
  onUndo?: (() => void) | undefined;
  onAction?: (() => void) | undefined;
  onExpire?: (() => void) | undefined;
  durationMs?: number | undefined;
  showCountdown?: boolean | undefined;
  showCheckIcon?: boolean | undefined;
}

export interface ToastItem extends ShowToastOptions {
  id: string;
  remainingSeconds: number;
  createdAt: number;
}

interface InternalToastRecord extends ToastItem {
  intervalId: number | null;
}

let toastCounter = 0;
let toastRecords: InternalToastRecord[] = [];
let snapshot: ToastItem[] = [];
const listeners = new Set<() => void>();

function syncSnapshot() {
  snapshot = toastRecords.map((record): ToastItem => {
    const {
      id,
      message,
      actionLabel,
      onUndo,
      onAction,
      onExpire,
      durationMs,
      showCountdown,
      showCheckIcon,
      remainingSeconds,
      createdAt,
    } = record;
    return {
      id,
      message,
      actionLabel,
      onUndo,
      onAction,
      onExpire,
      durationMs,
      showCountdown,
      showCheckIcon,
      remainingSeconds,
      createdAt,
    };
  });
  for (const listener of listeners) {
    listener();
  }
}

function clearRecordTimer(record: InternalToastRecord) {
  if (record.intervalId !== null && typeof window !== 'undefined') {
    window.clearInterval(record.intervalId);
    record.intervalId = null;
  }
}

export function dismissToast(id?: string): void {
  if (toastRecords.length === 0) {
    return;
  }
  const targetId = id ?? toastRecords[toastRecords.length - 1]?.id;
  if (!targetId) {
    return;
  }

  const record = toastRecords.find((item) => item.id === targetId);
  if (!record) {
    return;
  }

  clearRecordTimer(record);
  toastRecords = toastRecords.filter((item) => item.id !== targetId);
  syncSnapshot();
}

export function triggerToastUndo(id?: string): void {
  const targetId = id ?? toastRecords[toastRecords.length - 1]?.id;
  if (!targetId) {
    return;
  }

  const record = toastRecords.find((item) => item.id === targetId);
  if (!record) {
    return;
  }

  clearRecordTimer(record);
  toastRecords = toastRecords.filter((item) => item.id !== targetId);
  syncSnapshot();

  record.onUndo?.();
  record.onAction?.();
}

export function clearToasts(): void {
  for (const record of toastRecords) {
    clearRecordTimer(record);
  }
  toastRecords = [];
  syncSnapshot();
}

export function showToast(options: ShowToastOptions): string {
  toastCounter += 1;
  const id = options.id ?? `toast-${String(toastCounter)}`;
  const durationMs = options.durationMs ?? DEFAULT_TOAST_DURATION_MS;
  const initialSeconds = Math.max(1, Math.ceil(durationMs / 1_000));

  for (const existing of toastRecords) {
    clearRecordTimer(existing);
  }

  const record: InternalToastRecord = {
    ...options,
    id,
    durationMs,
    remainingSeconds: initialSeconds,
    createdAt: Date.now(),
    intervalId: null,
  };

  if (typeof window !== 'undefined' && durationMs > 0) {
    record.intervalId = window.setInterval(() => {
      const current = toastRecords.find((item) => item.id === id);
      if (!current) {
        return;
      }

      if (current.remainingSeconds <= 1) {
        clearRecordTimer(current);
        toastRecords = toastRecords.filter((item) => item.id !== id);
        syncSnapshot();
        current.onExpire?.();
        return;
      }

      current.remainingSeconds -= 1;
      syncSnapshot();
    }, 1_000);
  }

  toastRecords = [record];
  syncSnapshot();
  return id;
}

function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getToastsSnapshot(): ToastItem[] {
  return snapshot;
}

const EMPTY_TOASTS: ToastItem[] = [];

export function useToast() {
  const toasts = useSyncExternalStore(subscribeToasts, getToastsSnapshot, () => EMPTY_TOASTS);

  const currentToast = toasts[toasts.length - 1] ?? null;

  return {
    toasts,
    toast: currentToast,
    showToast,
    dismissToast,
    undoToast: triggerToastUndo,
    clearToasts,
  };
}
