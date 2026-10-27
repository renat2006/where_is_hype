import clsx from 'clsx';
import { type KeyboardEvent, useRef } from 'react';

import { Chip } from '@/shared/ui/chip';

import type { ChipOption } from './chip-group-options';

interface ChipGroupBaseProps<T extends string> {
  options: readonly ChipOption<T>[];
  ariaLabel?: string;
  disabled?: boolean;
  showCheck?: boolean;
  className?: string;
}

export interface SingleChipGroupProps<T extends string = string> extends ChipGroupBaseProps<T> {
  multiple?: false;
  value: T | null;
  onChange: (value: T) => void;
  allowDeselect?: boolean;
  onDeselect?: () => void;
}

export interface MultiChipGroupProps<T extends string = string> extends ChipGroupBaseProps<T> {
  multiple: true;
  value: readonly T[];
  onChange: (value: T[]) => void;
}

export type ChipGroupProps<T extends string = string> =
  SingleChipGroupProps<T> | MultiChipGroupProps<T>;

export function ChipGroup<T extends string = string>(props: ChipGroupProps<T>) {
  const { options, ariaLabel, disabled = false, showCheck = false, className } = props;
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isSelected = (optionValue: T): boolean => {
    if (props.multiple) {
      return props.value.includes(optionValue);
    }
    return props.value === optionValue;
  };

  const handleChipClick = (optionValue: T) => {
    if (props.multiple) {
      const exists = props.value.includes(optionValue);
      const next = exists
        ? props.value.filter((item) => item !== optionValue)
        : [...props.value, optionValue];
      props.onChange(next);
      return;
    }

    if (props.value === optionValue) {
      if (props.allowDeselect && props.onDeselect) {
        props.onDeselect();
      }
      return;
    }

    props.onChange(optionValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, currentIndex: number) => {
    const enabledIndices = options
      .map((opt, idx) => (!disabled && !opt.disabled ? idx : -1))
      .filter((idx) => idx !== -1);

    if (enabledIndices.length === 0) {
      return;
    }

    const posInEnabled = enabledIndices.indexOf(currentIndex);
    let targetEnabledPos = -1;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      targetEnabledPos = (posInEnabled + 1) % enabledIndices.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      targetEnabledPos = (posInEnabled - 1 + enabledIndices.length) % enabledIndices.length;
    } else if (event.key === 'Home') {
      event.preventDefault();
      targetEnabledPos = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      targetEnabledPos = enabledIndices.length - 1;
    }

    if (targetEnabledPos === -1) {
      return;
    }

    const nextIndex = enabledIndices[targetEnabledPos];
    if (nextIndex === undefined) {
      return;
    }

    const nextButton = buttonRefs.current[nextIndex];
    nextButton?.focus();

    if (!props.multiple) {
      const nextOption = options[nextIndex];
      if (nextOption) {
        props.onChange(nextOption.value);
      }
    }
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={clsx('flex flex-wrap items-center gap-2', className)}
    >
      {options.map((option, index) => {
        const selected = isSelected(option.value);
        const optionDisabled = disabled || Boolean(option.disabled);

        return (
          <div
            key={option.value}
            onKeyDown={(event) => {
              handleKeyDown(event, index);
            }}
          >
            <Chip
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              selected={selected}
              disabled={optionDisabled}
              mono={option.mono}
              count={option.count}
              icon={option.icon}
              showCheck={showCheck}
              onClick={() => {
                handleChipClick(option.value);
              }}
            >
              {option.label}
            </Chip>
          </div>
        );
      })}
    </div>
  );
}
