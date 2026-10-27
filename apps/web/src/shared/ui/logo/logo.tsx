import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type LogoVariant = 'lockup' | 'compact' | 'mark';

export type LogoSize = 'sm' | 'md' | 'lg';

const MARK_SIZE_CONFIG: Record<
  LogoSize,
  {
    boxClass: string;
    borderClass: string;
    questionClass: string;
    shadowClass: string;
  }
> = {
  sm: {
    boxClass: 'h-8 w-8',
    borderClass: 'border-2',
    questionClass: 'mt-0.5 text-[19px]',
    shadowClass: 'shadow-[0_0_0_1.5px_var(--color-on-marker),0_2px_0_1.5px_var(--color-ink)]',
  },
  md: {
    boxClass: 'h-11 w-11',
    borderClass: 'border-[3px]',
    questionClass: 'mt-0.5 text-[27px]',
    shadowClass: 'shadow-[0_0_0_1.5px_var(--color-on-marker),0_3px_0_1.5px_var(--color-ink)]',
  },
  lg: {
    boxClass: 'h-[76px] w-[76px]',
    borderClass: 'border-4',
    questionClass: 'mt-1 text-[48px]',
    shadowClass: 'shadow-[0_0_0_1.5px_var(--color-on-marker),0_3px_0_1.5px_var(--color-ink)]',
  },
};

const LOCKUP_SIZE_CONFIG: Record<
  LogoSize,
  {
    textClass: string;
    gapClass: string;
    markSize: LogoSize;
  }
> = {
  sm: {
    textClass: 'text-xl leading-none',
    gapClass: 'gap-1.5',
    markSize: 'sm',
  },
  md: {
    textClass: 'text-2xl leading-none',
    gapClass: 'gap-2',
    markSize: 'md',
  },
  lg: {
    textClass: 'text-[72px] leading-none',
    gapClass: 'gap-2.5',
    markSize: 'lg',
  },
};

export interface LogoMarkProps extends HTMLAttributes<HTMLSpanElement> {
  size?: LogoSize | undefined;
  label?: string | undefined;
}

export function LogoMark({
  size = 'md',
  label,
  className,
  style,
  'aria-label': ariaLabelProp,
  'aria-hidden': ariaHidden,
  ...rest
}: LogoMarkProps) {
  const cfg = MARK_SIZE_CONFIG[size];
  const isHidden = ariaHidden === true || ariaHidden === 'true';
  const computedAriaLabel = isHidden ? undefined : (ariaLabelProp ?? label ?? 'Где Хайп?');

  return (
    <span
      role={isHidden ? undefined : 'img'}
      aria-label={computedAriaLabel}
      aria-hidden={ariaHidden}
      data-logo-variant="mark"
      data-logo-size={size}
      style={{ transform: 'rotate(-4deg)', ...style }}
      className={clsx(
        'box-border inline-flex shrink-0 items-center justify-center rounded-full border-surface bg-marker text-on-marker select-none',
        cfg.boxClass,
        cfg.borderClass,
        cfg.shadowClass,
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className={clsx('font-display leading-none', cfg.questionClass)}>
        ?
      </span>
    </span>
  );
}

export interface LogoLockupProps extends HTMLAttributes<HTMLSpanElement> {
  size?: LogoSize | undefined;
  label?: string | undefined;
}

export function LogoLockup({
  size = 'md',
  label,
  className,
  'aria-label': ariaLabelProp,
  ...rest
}: LogoLockupProps) {
  const cfg = LOCKUP_SIZE_CONFIG[size];
  const computedAriaLabel = ariaLabelProp ?? label ?? 'Где Хайп?';

  return (
    <span
      role="img"
      aria-label={computedAriaLabel}
      data-logo-variant="lockup"
      data-logo-size={size}
      className={clsx('inline-flex items-center text-ink select-none', cfg.gapClass, className)}
      {...rest}
    >
      <span aria-hidden="true" className={clsx('font-display font-normal', cfg.textClass)}>
        Где Хайп
      </span>
      <LogoMark size={cfg.markSize} aria-hidden="true" />
    </span>
  );
}

export interface LogoCompactProps extends HTMLAttributes<HTMLSpanElement> {
  pill?: boolean | undefined;
  label?: string | undefined;
}

export function LogoCompact({
  pill = false,
  label,
  className,
  'aria-label': ariaLabelProp,
  ...rest
}: LogoCompactProps) {
  const computedAriaLabel = ariaLabelProp ?? label ?? 'Где Хайп?';

  return (
    <span
      role="img"
      aria-label={computedAriaLabel}
      data-logo-variant="compact"
      className={clsx(
        'inline-flex items-baseline font-display font-normal text-ink select-none',
        pill
          ? 'rounded-pill border-[1.5px] border-ink bg-glass px-3.5 py-2.5 text-[17px] leading-none backdrop-blur-[10px]'
          : 'text-lg leading-none',
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true">Где Хайп</span>
      <span aria-hidden="true" className="text-marker">
        ?
      </span>
    </span>
  );
}

export interface LogoProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: LogoVariant | undefined;
  size?: LogoSize | undefined;
  pill?: boolean | undefined;
  label?: string | undefined;
}

export function Logo({ variant = 'lockup', size = 'md', pill = false, label, ...rest }: LogoProps) {
  if (variant === 'compact') {
    return <LogoCompact pill={pill} label={label} {...rest} />;
  }
  if (variant === 'mark') {
    return <LogoMark size={size} label={label} {...rest} />;
  }
  return <LogoLockup size={size} label={label} {...rest} />;
}
