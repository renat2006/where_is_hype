import clsx from 'clsx';

import {
  EVENING_PRICE_OPTIONS,
  parseFilterMaxCheck,
} from '@/features/evening-filter/model/evening-filter-model';
import { ChipGroup } from '@/shared/ui/chip-group';

export interface PricePickerProps {
  value: number | null;
  onChange: (value: number | null) => void;
  label?: string | null | undefined;
  showHint?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function PricePicker({
  value,
  onChange,
  label = 'Чек',
  showHint = false,
  disabled = false,
  className,
}: PricePickerProps) {
  const selectedValue = value === null ? 'any' : String(value);

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {label && <b className="font-ui text-[15px] leading-5 font-semibold text-ink">{label}</b>}
      <ChipGroup
        ariaLabel={label ?? 'Чек'}
        options={EVENING_PRICE_OPTIONS}
        value={selectedValue}
        allowDeselect={value !== null}
        disabled={disabled}
        onDeselect={() => {
          onChange(null);
        }}
        onChange={(nextRaw) => {
          onChange(parseFilterMaxCheck(nextRaw));
        }}
      />
      {showHint && (
        <span className="font-mono text-xs leading-4 text-ink-muted">средний чек на человека</span>
      )}
    </div>
  );
}
