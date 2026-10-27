import { describe, expect, it } from 'vitest';

import type { WeeklyHours } from '../hours';
import type { Place } from '../place';
import { applyEveningFilter, defaultEveningFilter, eveningFilterSchema } from './filter';

const daytimeHours: WeeklyHours = {
  mon: { open: '08:00', close: '18:00' },
  tue: { open: '08:00', close: '18:00' },
  wed: { open: '08:00', close: '18:00' },
  thu: { open: '08:00', close: '18:00' },
  fri: { open: '08:00', close: '18:00' },
  sat: { open: '09:00', close: '18:00' },
  sun: { open: '09:00', close: '18:00' },
};

const eveningHours: WeeklyHours = {
  mon: { open: '12:00', close: '23:00' },
  tue: { open: '12:00', close: '23:00' },
  wed: { open: '12:00', close: '23:00' },
  thu: { open: '12:00', close: '23:00' },
  fri: { open: '12:00', close: '02:00' },
  sat: { open: '12:00', close: '02:00' },
  sun: { open: '12:00', close: '23:00' },
};

const places: Place[] = [
  {
    id: 'open-bar',
    name: 'Вечерний бар',
    type: 'bar',
    address: 'Покровка, 10',
    metro: { name: 'Чистые пруды', distanceM: 400 },
    location: { lat: 55.76, lng: 37.64 },
    hours: eveningHours,
    avgCheck: 1500,
    yandexOrgId: null,
  },
  {
    id: 'closed-coffee',
    name: 'Утренняя кофейня',
    type: 'coffee',
    address: 'Мясницкая, 15',
    metro: { name: 'Чистые пруды', distanceM: 300 },
    location: { lat: 55.764, lng: 37.638 },
    hours: daytimeHours,
    avgCheck: 500,
    yandexOrgId: null,
  },
  {
    id: 'unknown-hours-bar',
    name: 'Журавли',
    type: 'bar',
    address: 'Покровка, 17',
    metro: { name: 'Китай-город', distanceM: 700 },
    location: { lat: 55.759, lng: 37.647 },
    hours: null,
    avgCheck: 1500,
    yandexOrgId: null,
  },
  {
    id: 'unknown-check-cafe',
    name: 'Окна во двор',
    type: 'cafe',
    address: 'Пятницкая, 30',
    metro: { name: 'Новокузнецкая', distanceM: 1200 },
    location: { lat: 55.741, lng: 37.628 },
    hours: eveningHours,
    avgCheck: null,
    yandexOrgId: null,
  },
  {
    id: 'expensive-rest',
    name: 'Сосны',
    type: 'rest',
    address: 'Б. Никитская, 12',
    metro: { name: 'Охотный Ряд', distanceM: 450 },
    location: { lat: 55.757, lng: 37.609 },
    hours: eveningHours,
    avgCheck: 3000,
    yandexOrgId: null,
  },
];

describe('applyEveningFilter', () => {
  const now = new Date('2026-10-27T15:00:00+03:00');

  it('filters by selected hour and keeps places with unknown hours or check marked as unknown', () => {
    const filtered = applyEveningFilter(
      places,
      {
        at: 19,
        types: [],
        maxCheck: 1500,
        nearMetro: false,
      },
      now,
    );

    expect(filtered.map((p) => ({ id: p.id, unknown: p.unknown }))).toEqual([
      { id: 'open-bar', unknown: false },
      { id: 'unknown-hours-bar', unknown: true },
      { id: 'unknown-check-cafe', unknown: true },
    ]);
  });

  it('filters by place types and nearMetro (<= 1000 m)', () => {
    const filtered = applyEveningFilter(
      places,
      {
        at: 19,
        types: ['bar', 'cafe'],
        maxCheck: null,
        nearMetro: true,
      },
      now,
    );

    expect(filtered.map((p) => p.id)).toEqual(['open-bar', 'unknown-hours-bar']);
  });

  it('evaluates against current time when at is "now"', () => {
    const filteredAt3pm = applyEveningFilter(places, defaultEveningFilter, now);

    expect(filteredAt3pm.map((p) => p.id)).toContain('closed-coffee');
  });

  it('validates filter schema', () => {
    expect(
      eveningFilterSchema.parse({ at: 21, types: ['bar'], maxCheck: 1500, nearMetro: true }),
    ).toEqual({ at: 21, types: ['bar'], maxCheck: 1500, nearMetro: true });
    expect(eveningFilterSchema.safeParse({ ...defaultEveningFilter, at: 24 }).success).toBe(false);
  });
});
