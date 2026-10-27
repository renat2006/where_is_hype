import clsx from 'clsx';
import { type KeyboardEvent, useRef } from 'react';

import type { ThemeMode } from '@/shared/lib/theme';

import { type SegmentedOption, THEME_SEGMENTED_OPTIONS } from './segmented-options';

export interface ThemeSegmentedProps {
  options?: undefined;
  value: ThemeMode;
  onChange: (value: ThemeMode) => void;
  ariaLabel?: string | undefined;
  fullWidth?: boolean | undefined;
  className?: string | undefined;
}

export interface CustomSegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string | undefined;
  fullWidth?: boolean | undefined;
  className?: string | undefined;
}

export type SegmentedProps<T extends string = ThemeMode> =
  ThemeSegmentedProps | CustomSegmentedProps<T>;

export function Segmented(props: ThemeSegmentedProps): React.JSX.Element;
export function Segmented<T extends string>(props: CustomSegmentedProps<T>): React.JSX.Element;
export function Segmented<T extends string = ThemeMode>(props: SegmentedProps<T>) {
  const { ariaLabel = 'Тема', fullWidth = false, className } = props;
  const resolvedOptions: readonly SegmentedOption<string>[] =
    props.options ?? THEME_SEGMENTED_OPTIONS;
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectValue = (nextValue: string) => {
    if (props.options !== undefined) {
      for (const opt of props.options) {
        if (opt.value === nextValue) {
          props.onChange(opt.value);
          return;
        }
      }
      return;
    }
    if (nextValue === 'auto' || nextValue === 'day' || nextValue === 'night') {
      props.onChange(nextValue);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const enabledIndices = resolvedOptions
      .map((opt, idx) => (!opt.disabled ? idx : -1))
      .filter((idx) => idx !== -1);

    if (enabledIndices.length === 0) {
      return;
    }

    const pos = enabledIndices.indexOf(currentIndex);
    let nextPos = -1;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      nextPos = (pos + 1) % enabledIndices.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      nextPos = (pos - 1 + enabledIndices.length) % enabledIndices.length;
    } else if (event.key === 'Home') {
      event.preventDefault();
      nextPos = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      nextPos = enabledIndices.length - 1;
    }

    if (nextPos === -1) {
      return;
    }

    const nextIdx = enabledIndices[nextPos];
    if (nextIdx === undefined) {
      return;
    }

    const nextOption = resolvedOptions[nextIdx];
    if (nextOption) {
      buttonRefs.current[nextIdx]?.focus();
      selectValue(nextOption.value);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx(
        'box-border inline-flex items-center rounded-pill border-[1.5px] border-ink bg-surface p-1',
        fullWidth ? 'w-full justify-between' : 'self-start',
        className,
      )}
    >
      {resolvedOptions.map((option, index) => {
        const isSelected = option.value === props.value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => {
              selectValue(option.value);
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, index);
            }}
            className={clsx(
              'box-border inline-flex min-h-11 cursor-pointer items-center justify-center rounded-pill border-[1.5px] border-transparent px-3.5 font-ui text-sm leading-none font-medium whitespace-nowrap transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink disabled:cursor-not-allowed disabled:text-ink-muted',
              fullWidth && 'flex-1',
              isSelected
                ? 'bg-ink text-bg'
                : 'bg-transparent text-ink hover:bg-line/60 active:bg-line',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
