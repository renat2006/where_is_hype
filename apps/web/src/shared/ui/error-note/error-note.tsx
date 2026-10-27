import clsx from 'clsx';
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/shared/ui/button';
import { renderWithMonoDigits } from '@/shared/ui/chip';

export interface ErrorNoteProps {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function ErrorNote({
  id,
  title,
  description,
  children,
  actionLabel,
  onAction,
  className,
}: ErrorNoteProps) {
  const body = description ?? children;
  const hasBlockLayout = Boolean(title) || Boolean(actionLabel);

  return (
    <div
      id={id}
      role="alert"
      className={clsx(
        'flex items-start gap-2.5 rounded-[12px] bg-note-bg px-3.5 py-3 font-ui text-sm leading-5 text-ink',
        className,
      )}
    >
      <CircleAlert
        size={20}
        strokeWidth={2}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-ink"
      />
      {hasBlockLayout ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {title && <b className="font-bold text-ink">{renderWithMonoDigits(title)}</b>}
          {body && <span className="text-ink">{renderWithMonoDigits(body)}</span>}
          {actionLabel && (
            <Button
              variant="secondary"
              onClick={onAction}
              className="min-h-11 self-start px-4 text-sm"
            >
              {actionLabel}
            </Button>
          )}
        </div>
      ) : (
        <span className="min-w-0 flex-1 text-ink">{renderWithMonoDigits(body)}</span>
      )}
    </div>
  );
}
