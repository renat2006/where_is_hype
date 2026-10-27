import type { ReactNode } from 'react';

import type { ThemeMode } from '@/shared/lib/theme';

export interface SegmentedOption<T extends string = ThemeMode> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export const THEME_SEGMENTED_OPTIONS: readonly SegmentedOption[] = [
  { value: 'auto', label: 'Авто · по закату' },
  { value: 'day', label: 'День' },
  { value: 'night', label: 'Ночь' },
];
