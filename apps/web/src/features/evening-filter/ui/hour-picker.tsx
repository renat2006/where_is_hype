import type { EveningFilterAt } from '@where-is-hype/core';
import clsx from 'clsx';

import {
  formatFilterAtValue,
  getEveningHourChipOptions,
  parseFilterAt,
} from '@/features/evening-filter/model/evening-filter-model';
import { ChipGroup } from '@/shared/ui/chip-group';

export interface HourPickerProps {
  value: EveningFilterAt;
  onChange: (value: EveningFilterAt) => void;
  now?: Date | undefined;
  label?: string | null | undefined;
  showHint?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function HourPicker({
  value,
  onChange,
  now,
  label = 'Открыто в',
  showHint = false,
  disabled = false,
  className,
}: HourPickerProps) {
  const options = getEveningHourChipOptions(now, value);
  const selectedValue = formatFilterAtValue(value);

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {label && <b className="font-ui text-[15px] leading-5 font-semibold text-ink">{label}</b>}
      <ChipGroup
        ariaLabel={label ?? 'Открыто в'}
        options={options}
        value={selectedValue}
        disabled={disabled}
        onChange={(nextRaw) => {
          const parsed = parseFilterAt(nextRaw);
          if (parsed !== null) {
            onChange(parsed);
          }
        }}
      />
      {showHint && (
        <span className="font-mono text-xs leading-4 text-ink-muted">
          только сегодня · шаг 1 час · прошедшие часы скрыты
        </span>
      )}
    </div>
  );
}
