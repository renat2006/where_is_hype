import clsx from 'clsx';
import type { ReactNode } from 'react';

import { Button, type ButtonProps } from '@/shared/ui/button';
import { ToastViewport } from '@/shared/ui/toast';

import { useDeletePlace } from './use-delete-place';

export interface DeletePlaceButtonProps extends Omit<
  ButtonProps,
  'onClick' | 'variant' | 'children'
> {
  placeId: string;
  label?: string | undefined;
  children?: ReactNode | undefined;
  durationMs?: number | undefined;
  withViewport?: boolean | undefined;
  viewportClassName?: string | undefined;
  onDeleted?: ((placeId: string) => void) | undefined;
  onUndo?: ((placeId: string) => void) | undefined;
}

export function DeletePlaceButton({
  placeId,
  label = 'Удалить место',
  children,
  durationMs,
  withViewport = true,
  viewportClassName,
  onDeleted,
  onUndo,
  className,
  disabled,
  ...rest
}: DeletePlaceButtonProps) {
  const { triggerDelete, isPendingDelete } = useDeletePlace({
    placeId,
    durationMs,
    onDeleted,
    onUndo,
  });

  return (
    <>
      <Button
        variant="text"
        disabled={Boolean(disabled) || isPendingDelete}
        onClick={triggerDelete}
        data-testid="delete-place-button"
        className={clsx('min-h-[2.75rem] text-ink-muted hover:text-ink', className)}
        {...rest}
      >
        {children ?? label}
      </Button>
      {withViewport && (
        <ToastViewport {...(viewportClassName ? { className: viewportClassName } : {})} />
      )}
    </>
  );
}
