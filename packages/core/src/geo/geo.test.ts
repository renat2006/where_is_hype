import { describe, expect, it } from 'vitest';

import { distanceM, formatDistance, metroStations, metroStationSchema } from './geo';

describe('distanceM', () => {
  it('returns 0 for identical coordinates', () => {
    const point = { lat: 55.7649, lng: 37.6389 };
    expect(distanceM(point, point)).toBe(0);
  });

  it('computes Haversine distance in meters between two Moscow points', () => {
    const chistyePrudy = { lat: 55.7649, lng: 37.6389 };
    const pokrovka17 = { lat: 55.7593, lng: 37.6478 };
    const dist = distanceM(chistyePrudy, pokrovka17);

    expect(dist).toBeGreaterThan(800);
    expect(dist).toBeLessThan(900);
  });
});

describe('formatDistance', () => {
  it('formats distances under 1 km in meters with non-breaking space', () => {
    expect(formatDistance(0)).toBe('0\u00A0м');
    expect(formatDistance(450)).toBe('450\u00A0м');
    expect(formatDistance(999.4)).toBe('999\u00A0м');
  });

  it('handles the 999.5 m boundary by switching to kilometers', () => {
    expect(formatDistance(999.5)).toBe('1,0\u00A0км');
    expect(formatDistance(1000)).toBe('1,0\u00A0км');
  });

  it('formats kilometer distances with comma decimal and non-breaking space', () => {
    expect(formatDistance(1200)).toBe('1,2\u00A0км');
    expect(formatDistance(1560)).toBe('1,6\u00A0км');
    expect(formatDistance(2600)).toBe('2,6\u00A0км');
  });
});

describe('metroStations', () => {
  it('contains valid stations inside and on the Garden Ring', () => {
    expect(metroStations.length).toBeGreaterThanOrEqual(20);

    for (const station of metroStations) {
      expect(metroStationSchema.parse(station)).toEqual(station);
      expect(station.lat).toBeGreaterThan(55.71);
      expect(station.lat).toBeLessThan(55.79);
      expect(station.lng).toBeGreaterThan(37.57);
      expect(station.lng).toBeLessThan(37.67);
    }

    const names = metroStations.map((s) => s.name);
    expect(names).toContain('Чистые пруды');
    expect(names).toContain('Китай-город');
    expect(names).toContain('Тверская');
    expect(names).toContain('Арбатская');
    expect(names).toContain('Новокузнецкая');
  });
});
