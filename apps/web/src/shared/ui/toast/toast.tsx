import clsx from 'clsx';
import { Check } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { DEFAULT_TOAST_DURATION_MS, useToast } from './toast-store';

export interface ToastProps {
  message: ReactNode;
  actionLabel?: string | undefined;
  onUndo?: (() => void) | undefined;
  onAction?: (() => void) | undefined;
  onExpire?: (() => void) | undefined;
  onDismiss?: (() => void) | undefined;
  durationMs?: number | undefined;
  secondsLeft?: number | undefined;
  showCountdown?: boolean | undefined;
  showCheckIcon?: boolean | undefined;
  className?: string | undefined;
}

export function Toast({
  message,
  actionLabel,
  onUndo,
  onAction,
  onExpire,
  onDismiss,
  durationMs = DEFAULT_TOAST_DURATION_MS,
  secondsLeft: controlledSecondsLeft,
  showCountdown,
  showCheckIcon,
  className,
}: ToastProps) {
  const initialSeconds = Math.max(1, Math.ceil(durationMs / 1_000));
  const [internalSeconds, setInternalSeconds] = useState(initialSeconds);
  const [dismissed, setDismissed] = useState(false);

  const hasAction = Boolean(onUndo ?? onAction ?? actionLabel);
  const resolvedActionLabel = actionLabel ?? (hasAction ? 'Отменить' : undefined);
  const shouldShowCountdown = showCountdown ?? hasAction;
  const shouldShowCheck = showCheckIcon ?? !hasAction;

  const displayedSeconds = controlledSecondsLeft ?? internalSeconds;

  useEffect(() => {
    if (controlledSecondsLeft !== undefined || dismissed || durationMs <= 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setInternalSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          setDismissed(true);
          onExpire?.();
          onDismiss?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [controlledSecondsLeft, dismissed, durationMs, onDismiss, onExpire]);

  if (dismissed && controlledSecondsLeft === undefined) {
    return null;
  }

  const handleActionClick = () => {
    setDismissed(true);
    onUndo?.();
    onAction?.();
    onDismiss?.();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'box-border flex items-center gap-3 rounded-md bg-ink font-ui text-[15px] leading-5 text-bg',
        hasAction ? 'py-2 pr-2 pl-4' : 'px-4 py-3.5',
        className,
      )}
    >
      {shouldShowCheck && (
        <Check size={20} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-bg" />
      )}

      <span className="min-w-0 flex-1 text-[15px] leading-5 text-bg">{message}</span>

      {shouldShowCountdown && displayedSeconds > 0 && (
        <span
          data-testid="toast-countdown"
          className="font-mono text-[13px] leading-none text-bg opacity-70"
        >
          {displayedSeconds}
        </span>
      )}

      {resolvedActionLabel && (
        <button
          type="button"
          onClick={handleActionClick}
          className="box-border inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-pill border-[1.5px] border-bg bg-transparent px-4 font-ui text-base leading-none font-semibold whitespace-nowrap text-bg transition-colors duration-150 ease-out hover:bg-bg/10 focus-visible:outline-[2.5px] focus-visible:outline-offset-[2px] focus-visible:outline-bg active:translate-y-[2px]"
        >
          {resolvedActionLabel}
        </button>
      )}
    </div>
  );
}

export function ToastViewport({ className }: { className?: string }) {
  const { toasts, dismissToast: dismiss, undoToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className={clsx(
        'pointer-events-none fixed right-4 bottom-4 left-4 z-30 mx-auto flex max-w-[398px] flex-col gap-2',
        className,
      )}
    >
      {toasts.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <Toast
            message={item.message}
            actionLabel={item.actionLabel}
            secondsLeft={item.remainingSeconds}
            showCountdown={item.showCountdown}
            showCheckIcon={item.showCheckIcon}
            onUndo={
              item.onUndo || item.onAction
                ? () => {
                    undoToast(item.id);
                  }
                : undefined
            }
            onDismiss={() => {
              dismiss(item.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastViewport />
    </>
  );
}
