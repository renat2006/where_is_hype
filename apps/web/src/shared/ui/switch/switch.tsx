import clsx from 'clsx';
import { type ReactNode, useId } from 'react';

import { renderWithMonoDigits } from '@/shared/ui/chip';

export interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  onCheckedChange,
  label,
  ariaLabel,
  disabled = false,
  className,
}: SwitchProps) {
  const labelId = useId();

  const toggle = () => {
    if (disabled) {
      return;
    }
    const next = !checked;
    onChange?.(next);
    onCheckedChange?.(next);
  };

  const switchButton = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={label && !ariaLabel ? labelId : undefined}
      disabled={disabled}
      onClick={toggle}
      className={clsx(
        'relative box-border inline-flex h-8 w-[52px] shrink-0 cursor-pointer items-center rounded-pill border-[1.5px] transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink disabled:cursor-not-allowed',
        disabled ? 'border-line bg-line' : checked ? 'border-ink bg-ink' : 'border-ink bg-surface',
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'pointer-events-none block h-[23px] w-[23px] rounded-full transition-transform duration-150 ease-out',
          checked ? 'translate-x-[23px]' : 'translate-x-[3px]',
          disabled ? 'bg-ink-muted' : checked ? 'bg-marker' : 'bg-ink',
        )}
      />
    </button>
  );

  if (!label) {
    return (
      <div className={clsx('inline-flex min-h-11 items-center', className)}>{switchButton}</div>
    );
  }

  return (
    <div
      className={clsx(
        'flex min-h-11 items-center justify-between gap-3',
        disabled && 'opacity-70',
        className,
      )}
    >
      <span
        id={labelId}
        onClick={toggle}
        className={clsx(
          'font-ui text-base leading-6 text-ink select-none',
          !disabled && 'cursor-pointer',
        )}
      >
        {renderWithMonoDigits(label)}
      </span>
      {switchButton}
    </div>
  );
}
