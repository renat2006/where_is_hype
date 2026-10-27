import clsx from 'clsx';
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'map';
export type ButtonVisualState = 'default' | 'pressed' | 'focus';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: string;
  visualState?: ButtonVisualState;
  errorText?: string;
  fullWidth?: boolean;
  children?: ReactNode;
}

export function LoadingDots({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid="loading-dots"
      className={clsx('inline-flex items-center gap-[5px]', compact && 'scale-70', className)}
    >
      <span className="h-[7px] w-[7px] rounded-full bg-current" />
      <span className="h-[7px] w-[7px] rounded-full bg-current opacity-60" />
      <span className="h-[7px] w-[7px] rounded-full bg-current opacity-30" />
    </span>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    loading = false,
    loadingLabel,
    visualState = 'default',
    errorText,
    fullWidth = false,
    disabled = false,
    type = 'button',
    className,
    children,
    'aria-label': ariaLabel,
    ...rest
  },
  ref,
) {
  const isDisabledVisual = disabled && !loading;
  const isPressed = visualState === 'pressed' && !disabled && !loading;
  const isFocused = visualState === 'focus' && !disabled;

  const baseClasses =
    ' box-border inline-flex cursor-pointer items-center justify-center rounded-pill font-ui text-base leading-tight font-semibold no-underline select-none transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink disabled:cursor-not-allowed';

  const variantClasses: Record<ButtonVariant, string> = {
    primary: clsx(
      'min-h-12 gap-2 border-[1.5px] px-5 py-2.5 text-center',
      isDisabledVisual
        ? 'border-transparent bg-line text-ink-muted shadow-none'
        : clsx(
            'border-ink bg-marker text-on-marker',
            isPressed
              ? 'translate-y-[3px] shadow-none'
              : 'shadow-raised active:translate-y-[3px] active:shadow-none',
          ),
    ),
    secondary: clsx(
      'min-h-12 gap-2 border-[1.5px] px-5 py-2.5 text-center shadow-none',
      isDisabledVisual
        ? 'border-transparent bg-line text-ink-muted'
        : clsx(
            'border-ink bg-surface text-ink',
            isPressed ? 'translate-y-[3px] bg-line' : 'active:translate-y-[3px] active:bg-line',
          ),
    ),
    text: clsx(
      'min-h-11 gap-2 border-[1.5px] border-transparent px-2 py-1.5 text-center shadow-none',
      isDisabledVisual
        ? 'bg-transparent text-ink-muted no-underline'
        : clsx(
            'text-ink underline underline-offset-4',
            isPressed ? 'bg-line' : 'bg-transparent hover:bg-line/50 active:bg-line',
          ),
    ),
    map: clsx(
      'min-h-12 min-w-12 gap-2 border-[1.5px] px-3 py-2 text-center shadow-none backdrop-blur-[10px]',
      isDisabledVisual
        ? 'border-line bg-glass text-ink-muted'
        : clsx(
            'border-ink text-ink',
            isPressed
              ? 'translate-y-[2px] bg-line'
              : 'bg-glass active:translate-y-[2px] active:bg-line',
          ),
    ),
  };

  const buttonElement = (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={loading && loadingLabel ? loadingLabel : ariaLabel}
      className={clsx(
        baseClasses,
        variantClasses[variant],
        isFocused && 'outline-[2.5px] outline-offset-[3px] outline-ink',
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <LoadingDots compact={variant === 'map'} /> : children}
    </button>
  );

  if (!errorText) {
    return buttonElement;
  }

  if (variant === 'map') {
    return (
      <div className="inline-flex items-center gap-2">
        {buttonElement}
        <span className="text-[13px] leading-4 text-ink-muted">{errorText}</span>
      </div>
    );
  }

  return (
    <div className={clsx('inline-flex flex-col items-start gap-1.5', fullWidth && 'w-full')}>
      {buttonElement}
      <span className="text-[13px] leading-4 text-ink-muted">{errorText}</span>
    </div>
  );
});
