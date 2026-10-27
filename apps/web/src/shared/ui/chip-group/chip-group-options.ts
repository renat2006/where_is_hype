import type { ReactNode } from 'react';

export interface ChipOption<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  mono?: boolean;
  count?: number;
  icon?: ReactNode;
}

export function getEveningHourOptions(currentHour = 17): ChipOption[] {
  const startHour = Math.max(18, Math.min(23, currentHour + 1));
  const options: ChipOption[] = [{ value: 'now', label: 'Сейчас' }];

  if (currentHour <= 22) {
    for (let hour = startHour; hour <= 23; hour += 1) {
      const formatted = `${String(hour).padStart(2, '0')}:00`;
      options.push({
        value: formatted,
        label: formatted,
        mono: true,
      });
    }
  }

  return options;
}

export const PLACE_TYPE_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: 'coffee', label: 'Кофейня' },
  { value: 'cafe', label: 'Кафе' },
  { value: 'restaurant', label: 'Ресторан' },
  { value: 'bar', label: 'Бар' },
];

export const PRICE_CHIP_OPTIONS: readonly ChipOption[] = [
  { value: 'any', label: 'Любой' },
  { value: '1000', label: 'до 1000 ₽' },
  { value: '1500', label: 'до 1500 ₽' },
  { value: '2500', label: 'до 2500 ₽' },
  { value: '4000', label: 'до 4000 ₽' },
];
