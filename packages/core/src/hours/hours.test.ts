import { describe, expect, it } from 'vitest';

import type { WeeklyHours } from './hours';
import { formatHoursStatus, hoursStatus, weeklyHoursSchema } from './hours';

const regularSchedule: WeeklyHours = {
  mon: { open: '12:00', close: '23:00' },
  tue: { open: '12:00', close: '23:00' },
  wed: { open: '12:00', close: '23:00' },
  thu: { open: '12:00', close: '23:00' },
  fri: { open: '12:00', close: '02:00' },
  sat: { open: '14:00', close: '02:00' },
  sun: null,
};

const midnightClosingSchedule: WeeklyHours = {
  mon: { open: '10:00', close: '00:00' },
  tue: { open: '10:00', close: '00:00' },
  wed: { open: '10:00', close: '00:00' },
  thu: { open: '10:00', close: '00:00' },
  fri: { open: '10:00', close: '00:00' },
  sat: { open: '10:00', close: '00:00' },
  sun: { open: '10:00', close: '00:00' },
};

describe('hoursStatus', () => {
  it('returns unknown when hours are null', () => {
    expect(hoursStatus(null, new Date('2026-10-27T12:00:00+03:00'))).toEqual({
      kind: 'unknown',
    });
  });

  it('returns open during regular daytime hours in Moscow timezone', () => {
    // 2026-10-27 is Tuesday; 16:00 UTC is 19:00 MSK
    const status = hoursStatus(regularSchedule, new Date('2026-10-27T16:00:00Z'));

    expect(status).toEqual({ kind: 'open', until: '23:00' });
  });

  it('returns closed before opening time on the same day', () => {
    // Tuesday 10:30 MSK
    const status = hoursStatus(regularSchedule, new Date('2026-10-27T10:30:00+03:00'));

    expect(status).toEqual({ kind: 'closed', opensAt: '12:00' });
  });

  it('returns closed at the exact closing minute', () => {
    // Tuesday 23:00 MSK -> closed, opens Wednesday at 12:00
    const status = hoursStatus(regularSchedule, new Date('2026-10-27T23:00:00+03:00'));

    expect(status).toEqual({ kind: 'closed', opensAt: '12:00' });
  });

  it('handles overnight shift after midnight (Friday night into Saturday)', () => {
    // Friday 2026-10-30 at 23:30 MSK
    expect(hoursStatus(regularSchedule, new Date('2026-10-30T23:30:00+03:00'))).toEqual({
      kind: 'open',
      until: '02:00',
    });

    // Saturday 2026-10-31 at 00:00 MSK (exact midnight)
    expect(hoursStatus(regularSchedule, new Date('2026-10-31T00:00:00+03:00'))).toEqual({
      kind: 'open',
      until: '02:00',
    });

    // Saturday 2026-10-31 at 01:30 MSK
    expect(hoursStatus(regularSchedule, new Date('2026-10-31T01:30:00+03:00'))).toEqual({
      kind: 'open',
      until: '02:00',
    });

    // Saturday 2026-10-31 at 02:00 MSK -> Friday shift ended, Saturday opens at 14:00
    expect(hoursStatus(regularSchedule, new Date('2026-10-31T02:00:00+03:00'))).toEqual({
      kind: 'closed',
      opensAt: '14:00',
    });
  });

  it('handles overnight shift into a closed day (Saturday night into Sunday)', () => {
    // Sunday 2026-11-01 at 01:00 MSK -> still open from Saturday until 02:00
    expect(hoursStatus(regularSchedule, new Date('2026-11-01T01:00:00+03:00'))).toEqual({
      kind: 'open',
      until: '02:00',
    });

    // Sunday 2026-11-01 at 13:00 MSK -> Sunday is closed, next open is Monday at 12:00
    expect(hoursStatus(regularSchedule, new Date('2026-11-01T13:00:00+03:00'))).toEqual({
      kind: 'closed',
      opensAt: '12:00',
    });
  });

  it('handles schedule closing at 00:00 (midnight boundary)', () => {
    expect(hoursStatus(midnightClosingSchedule, new Date('2026-10-27T23:59:00+03:00'))).toEqual({
      kind: 'open',
      until: '00:00',
    });

    expect(hoursStatus(midnightClosingSchedule, new Date('2026-10-28T00:00:00+03:00'))).toEqual({
      kind: 'closed',
      opensAt: '10:00',
    });
  });

  it('validates weekly schedule with weeklyHoursSchema', () => {
    expect(weeklyHoursSchema.parse(regularSchedule)).toEqual(regularSchedule);
    expect(
      weeklyHoursSchema.safeParse({
        ...regularSchedule,
        mon: { open: '25:00', close: '23:00' },
      }).success,
    ).toBe(false);
  });
});

describe('formatHoursStatus', () => {
  it('formats open status', () => {
    expect(formatHoursStatus({ kind: 'open', until: '23:00' })).toBe('Открыто до 23:00');
  });

  it('formats closed status', () => {
    expect(formatHoursStatus({ kind: 'closed', opensAt: '12:00' })).toBe(
      'Закрыто, откроется в 12:00',
    );
  });

  it('formats unknown status and null schedule', () => {
    expect(formatHoursStatus({ kind: 'unknown' })).toBe('Часы не уточнены');
    expect(formatHoursStatus(null)).toBe('Часы не уточнены');
  });
});
