import clsx from 'clsx';
import type { CSSProperties, HTMLAttributes } from 'react';

export type SkeletonVariant = 'rect' | 'circle' | 'text' | 'place-row';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
}

export function Skeleton({
  variant = 'rect',
  width,
  height,
  className,
  style,
  ...rest
}: SkeletonProps) {
  if (variant === 'place-row') {
    return (
      <div
        aria-hidden="true"
        data-testid="skeleton-place-row"
        className={clsx('flex items-center gap-3', className)}
        style={style}
        {...rest}
      >
        <div className="h-9 w-9 shrink-0 rounded-full bg-line" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-3.5 w-[70%] rounded-sm bg-line" />
          <div className="h-3 w-[45%] rounded-sm bg-line" />
        </div>
      </div>
    );
  }

  const resolvedStyle: CSSProperties = {
    width: typeof width === 'number' ? `${String(width)}px` : width,
    height: typeof height === 'number' ? `${String(height)}px` : height,
    ...style,
  };

  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      style={resolvedStyle}
      className={clsx(
        'bg-line',
        variant === 'circle'
          ? 'rounded-full'
          : variant === 'text'
            ? 'h-3.5 rounded-sm'
            : 'rounded-sm',
        className,
      )}
      {...rest}
    />
  );
}

export function PlaceRowSkeleton({ className }: { className?: string }) {
  return <Skeleton variant="place-row" className={className} />;
}
