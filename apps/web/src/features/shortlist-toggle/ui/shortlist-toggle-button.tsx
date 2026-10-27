import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { ButtonHTMLAttributes, MouseEventHandler } from 'react';

import {
  SHORTLIST_ADD_LABEL,
  SHORTLIST_LIMIT_CAPTION,
  useShortlistToggle,
} from '@/features/shortlist-toggle/model/use-shortlist-toggle';
import { Button } from '@/shared/ui/button';

export type ShortlistToggleMode = 'card' | 'row';

export interface ShortlistToggleButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
> {
  placeId: string;
  placeName?: string | undefined;
  mode?: ShortlistToggleMode | undefined;
  onToggled?: ((inEvening: boolean, placeIds: string[]) => void) | undefined;
}

function ShortlistFlagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d="M4 22V4a1 1 0 0 1 1-1h12l-3 5 3 5H5" />
    </svg>
  );
}

export function ShortlistToggleButton({
  placeId,
  placeName,
  mode = 'card',
  onToggled,
  className,
  disabled: disabledProp,
  'aria-label': ariaLabelProp,
  ...rest
}: ShortlistToggleButtonProps) {
  const { inEvening, isLimitReached, label, limitNote, toggle } = useShortlistToggle({
    placeId,
    onToggled,
  });

  const isDisabled = Boolean(disabledProp) || isLimitReached;

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    if (mode === 'row') {
      event.preventDefault();
    }
    if (isDisabled) {
      return;
    }
    void toggle();
  };

  if (mode === 'row') {
    const resolvedRowAriaLabel =
      ariaLabelProp ??
      (isLimitReached
        ? `${SHORTLIST_ADD_LABEL}${placeName ? `: ${placeName}` : ''} · ${SHORTLIST_LIMIT_CAPTION}`
        : placeName
          ? `${label}: ${placeName}`
          : label);

    return (
      <button
        type="button"
        disabled={isDisabled}
        aria-pressed={inEvening}
        aria-label={resolvedRowAriaLabel}
        title={resolvedRowAriaLabel}
        data-testid={`shortlist-row-toggle-${placeId}`}
        data-in-evening={inEvening ? 'true' : 'false'}
        onClick={handleClick}
        className={clsx(
          'box-border inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border-[1.5px] font-ui text-xs leading-none font-semibold transition-colors duration-150 ease-out select-none focus-visible:outline-[2.5px] focus-visible:outline-offset-[2px] focus-visible:outline-ink',
          isDisabled
            ? 'cursor-not-allowed border-transparent bg-line text-ink-muted'
            : inEvening
              ? 'cursor-pointer border-ink bg-ink text-bg active:opacity-90'
              : 'cursor-pointer border-line bg-surface text-ink hover:border-ink hover:bg-line/50 active:bg-line',
          className,
        )}
        {...rest}
      >
        {isLimitReached ? (
          <>
            <ShortlistFlagIcon size={16} />
            <span className="sr-only">{SHORTLIST_LIMIT_CAPTION}</span>
          </>
        ) : inEvening ? (
          <>
            <Check size={16} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
            <span className="sr-only">{label}</span>
          </>
        ) : (
          <>
            <ShortlistFlagIcon size={16} />
            <span className="sr-only">{SHORTLIST_ADD_LABEL}</span>
          </>
        )}
      </button>
    );
  }

  const resolvedCardAriaLabel =
    ariaLabelProp ??
    (isLimitReached ? `${SHORTLIST_ADD_LABEL} · ${SHORTLIST_LIMIT_CAPTION}` : undefined);

  return (
    <Button
      variant="secondary"
      fullWidth
      disabled={isDisabled}
      {...(limitNote !== undefined ? { errorText: limitNote } : {})}
      aria-pressed={inEvening}
      {...(resolvedCardAriaLabel !== undefined ? { 'aria-label': resolvedCardAriaLabel } : {})}
      data-testid="shortlist-toggle-button"
      data-in-evening={inEvening ? 'true' : 'false'}
      onClick={handleClick}
      className={clsx(
        'min-h-[3rem] px-[1.25rem] py-[0.625rem] text-[1rem] whitespace-normal',
        className,
      )}
      {...rest}
    >
      {inEvening ? (
        <Check size={18} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
      ) : (
        <ShortlistFlagIcon size={18} />
      )}
      <span>{label}</span>
    </Button>
  );
}
