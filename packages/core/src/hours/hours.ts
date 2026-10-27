import { z } from 'zod';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MOSCOW_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

export const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const weekdaySchema = z.enum(weekdays);

export const timeStringSchema = z.string().regex(TIME_PATTERN, 'Expected time in HH:MM format');

export const dayHoursSchema = z.object({
  open: timeStringSchema,
  close: timeStringSchema,
});

export const weeklyHoursSchema = z.object({
  mon: dayHoursSchema.nullable(),
  tue: dayHoursSchema.nullable(),
  wed: dayHoursSchema.nullable(),
  thu: dayHoursSchema.nullable(),
  fri: dayHoursSchema.nullable(),
  sat: dayHoursSchema.nullable(),
  sun: dayHoursSchema.nullable(),
});

export const hoursStatusSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('open'),
    until: timeStringSchema,
  }),
  z.object({
    kind: z.literal('closed'),
    opensAt: timeStringSchema,
  }),
  z.object({
    kind: z.literal('unknown'),
  }),
]);

export type Weekday = z.infer<typeof weekdaySchema>;
export type DayHours = z.infer<typeof dayHoursSchema>;
export type WeeklyHours = z.infer<typeof weeklyHoursSchema>;
export type HoursStatus = z.infer<typeof hoursStatusSchema>;

function parseTimeToMinutes(time: string): number {
  const [hoursPart, minutesPart] = time.split(':');
  return Number(hoursPart) * 60 + Number(minutesPart);
}

export function getMoscowDayAndMinutes(at: Date): { dayIndex: number; minutes: number } {
  const moscowDate = new Date(at.getTime() + MOSCOW_UTC_OFFSET_MS);
  const utcDay = moscowDate.getUTCDay();
  const dayIndex = (utcDay + 6) % 7;
  const minutes = moscowDate.getUTCHours() * 60 + moscowDate.getUTCMinutes();

  return { dayIndex, minutes };
}

export function hoursStatus(hours: WeeklyHours | null | undefined, at: Date): HoursStatus {
  if (!hours || Number.isNaN(at.getTime())) {
    return { kind: 'unknown' };
  }

  const { dayIndex, minutes } = getMoscowDayAndMinutes(at);
  const prevDayIndex = (dayIndex + 6) % 7;
  const prevDayKey = weekdays[prevDayIndex];
  const prevDayHours = prevDayKey ? hours[prevDayKey] : null;

  if (prevDayHours) {
    const prevOpen = parseTimeToMinutes(prevDayHours.open);
    const prevClose = parseTimeToMinutes(prevDayHours.close);
    if (prevClose > 0 && prevClose <= prevOpen && minutes < prevClose) {
      return { kind: 'open', until: prevDayHours.close };
    }
  }

  const todayKey = weekdays[dayIndex];
  const todayHours = todayKey ? hours[todayKey] : null;

  if (todayHours) {
    const todayOpen = parseTimeToMinutes(todayHours.open);
    const todayClose = parseTimeToMinutes(todayHours.close);
    const todayEnd = todayClose <= todayOpen ? todayClose + MINUTES_PER_DAY : todayClose;

    if (minutes < todayOpen) {
      return { kind: 'closed', opensAt: todayHours.open };
    }

    if (minutes < todayEnd) {
      return { kind: 'open', until: todayHours.close };
    }
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const nextDayKey = weekdays[(dayIndex + offset) % 7];
    const nextDayHours = nextDayKey ? hours[nextDayKey] : null;
    if (nextDayHours) {
      return { kind: 'closed', opensAt: nextDayHours.open };
    }
  }

  return { kind: 'unknown' };
}

export function formatHoursStatus(status: HoursStatus): string;
export function formatHoursStatus(hours: WeeklyHours | null | undefined, at?: Date): string;
export function formatHoursStatus(
  statusOrHours: HoursStatus | WeeklyHours | null | undefined,
  at?: Date,
): string {
  if (!statusOrHours) {
    return 'Часы не уточнены';
  }

  const status: HoursStatus =
    'kind' in statusOrHours ? statusOrHours : hoursStatus(statusOrHours, at ?? new Date());

  switch (status.kind) {
    case 'open':
      return `Открыто до ${status.until}`;
    case 'closed':
      return `Закрыто, откроется в ${status.opensAt}`;
    case 'unknown':
      return 'Часы не уточнены';
  }
}
