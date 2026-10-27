import clsx from 'clsx';
import { Check } from 'lucide-react';
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';

import { LoadingDots } from '@/shared/ui/button';

import { renderWithMonoDigits } from './mono-digits';

export type ChipVariant = 'filter' | 'vote';
export type ChipVisualState = 'default' | 'pressed' | 'focus';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean | undefined;
  variant?: ChipVariant | undefined;
  showCheck?: boolean | undefined;
  mono?: boolean | undefined;
  count?: number | undefined;
  icon?: ReactNode | undefined;
  loading?: boolean | undefined;
  visualState?: ChipVisualState | undefined;
  errorText?: string | undefined;
  children?: ReactNode | undefined;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  {
    selected = false,
    variant = 'filter',
    showCheck = false,
    mono = false,
    count,
    icon,
    loading = false,
    visualState = 'default',
    errorText,
    disabled = false,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref,
) {
  const isDisabledVisual = disabled && !loading;
  const isPressed = visualState === 'pressed' && !disabled && !loading;
  const isFocused = visualState === 'focus' && !disabled;

  const baseClasses =
    'box-border inline-flex min-h-11 cursor-pointer items-center justify-center rounded-pill border-[1.5px] px-4 py-1.5 leading-none font-medium whitespace-nowrap select-none transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink disabled:cursor-not-allowed';

  const variantClasses =
    variant === 'vote'
      ? clsx(
          'gap-2 text-[15px]',
          isDisabledVisual
            ? 'border-line bg-surface text-ink-muted'
            : selected
              ? 'border-ink bg-marker text-on-marker'
              : clsx(
                  'border-ink text-ink',
                  isPressed ? 'bg-line' : 'bg-surface hover:bg-line/50 active:bg-line',
                ),
        )
      : clsx(
          'gap-1.5',
          mono ? 'font-mono text-sm' : 'font-ui text-[15px]',
          isDisabledVisual
            ? 'border-line bg-surface text-ink-muted'
            : selected
              ? 'border-ink bg-ink text-bg'
              : clsx(
                  'border-ink text-ink',
                  isPressed ? 'bg-line' : 'bg-surface hover:bg-line/50 active:bg-line',
                ),
        );

  const chipElement = (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-pressed={selected}
      aria-busy={loading || undefined}
      className={clsx(
        baseClasses,
        variantClasses,
        isFocused && 'outline-[2.5px] outline-offset-[3px] outline-ink',
        className,
      )}
      {...rest}
    >
      {selected && showCheck ? (
        <Check
          size={variant === 'vote' ? 18 : 16}
          strokeWidth={2.5}
          aria-hidden="true"
          className="shrink-0"
        />
      ) : (
        icon
      )}
      <span>{mono ? children : renderWithMonoDigits(children)}</span>
      {loading ? (
        <LoadingDots compact className="scale-60" />
      ) : (
        count !== undefined && <span className="font-mono text-[13px] leading-none">{count}</span>
      )}
    </button>
  );

  if (!errorText) {
    return chipElement;
  }

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      {chipElement}
      <span className="text-[13px] leading-4 text-ink-muted">{errorText}</span>
    </div>
  );
});
