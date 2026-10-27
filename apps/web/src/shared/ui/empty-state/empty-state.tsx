import clsx from 'clsx';
import type { ReactNode } from 'react';

import { Button, type ButtonVariant } from '@/shared/ui/button';
import { renderWithMonoDigits } from '@/shared/ui/chip';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: ButtonVariant;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = 'primary',
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'box-border flex flex-col gap-2 rounded-md border-[1.5px] border-line bg-surface p-5 text-ink',
        className,
      )}
    >
      <h2 className="m-0 font-display text-[22px] leading-[1.15] font-normal text-ink">{title}</h2>

      {description && (
        <p className="m-0 font-ui text-[15px] leading-[22px] text-ink">
          {renderWithMonoDigits(description)}
        </p>
      )}

      {children}

      {actionLabel && (
        <Button variant={actionVariant} onClick={onAction} className="mt-2 self-start">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
