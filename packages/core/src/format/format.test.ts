import { describe, expect, it } from 'vitest';

import { formatPrice, formatRubles } from './format';

describe('formatPrice', () => {
  it('formats price with non-breaking spaces and thousands separator', () => {
    expect(formatPrice(1500)).toBe('до\u00A01\u00A0500\u00A0₽');
    expect(formatPrice(2500)).toBe('до\u00A02\u00A0500\u00A0₽');
    expect(formatPrice(10000)).toBe('до\u00A010\u00A0000\u00A0₽');
  });

  it('formats price below 1000 with non-breaking spaces', () => {
    expect(formatPrice(600)).toBe('до\u00A0600\u00A0₽');
  });

  it('rounds fractional rubles', () => {
    expect(formatRubles(1499.6)).toBe('1\u00A0500');
  });
});
