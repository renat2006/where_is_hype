import { describe, expect, it } from 'vitest';

import { formatDistance } from './format-distance';

describe('formatDistance', () => {
  it('formats distances under 1000 meters as whole meters', () => {
    expect(formatDistance(0)).toBe('0 м');
    expect(formatDistance(450)).toBe('450 м');
    expect(formatDistance(999)).toBe('999 м');
  });

  it('rounds fractional meters and switches to kilometers when rounding reaches 1000', () => {
    expect(formatDistance(450.4)).toBe('450 м');
    expect(formatDistance(999.4)).toBe('999 м');
    expect(formatDistance(999.5)).toBe('1,0 км');
  });

  it('formats distances from 1000 meters as kilometers with one decimal place after comma', () => {
    expect(formatDistance(1000)).toBe('1,0 км');
    expect(formatDistance(1234)).toBe('1,2 км');
    expect(formatDistance(1250)).toBe('1,3 км');
  });

  // Negative numbers, NaN, and Infinity are invalid physical distances;
  // throwing RangeError prevents silently rendering broken coordinates as "0 м".
  it('throws RangeError for negative numbers, NaN, and infinite values', () => {
    expect(() => formatDistance(-1)).toThrow(RangeError);
    expect(() => formatDistance(-100)).toThrow(RangeError);
    expect(() => formatDistance(Number.NaN)).toThrow(RangeError);
    expect(() => formatDistance(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => formatDistance(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });
});
