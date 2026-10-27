import { beforeEach, describe, expect, it } from 'vitest';

import {
  getMoscowSunTimes,
  getStoredThemeMode,
  initTheme,
  isMoscowNight,
  resolveTheme,
  setThemeMode,
  THEME_COLOR_BY_RESOLVED,
  THEME_STORAGE_KEY,
} from './theme';

describe('theme lib', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = '<meta name="theme-color" content="#F4EFE6" />';
  });

  it('calculates Moscow sunrise and sunset times across seasons without external libraries', () => {
    const summer = getMoscowSunTimes(new Date('2026-06-21T09:00:00Z'));
    const autumn = getMoscowSunTimes(new Date('2026-10-27T09:00:00Z'));
    const winter = getMoscowSunTimes(new Date('2026-12-21T09:00:00Z'));

    // Summer solstice in Moscow: sunrise around 03:45 MSK (225 min), sunset around 21:18 MSK (1278 min)
    expect(summer.sunriseMinutes).toBeGreaterThanOrEqual(215);
    expect(summer.sunriseMinutes).toBeLessThanOrEqual(240);
    expect(summer.sunsetMinutes).toBeGreaterThanOrEqual(1265);
    expect(summer.sunsetMinutes).toBeLessThanOrEqual(1290);

    // Late October in Moscow: sunset around 16:50–17:10 MSK (1010–1030 min)
    expect(autumn.sunsetMinutes).toBeGreaterThanOrEqual(1005);
    expect(autumn.sunsetMinutes).toBeLessThanOrEqual(1035);

    // Winter solstice in Moscow: sunrise around 08:57 MSK (537 min), sunset around 15:58 MSK (958 min)
    expect(winter.sunriseMinutes).toBeGreaterThanOrEqual(525);
    expect(winter.sunriseMinutes).toBeLessThanOrEqual(550);
    expect(winter.sunsetMinutes).toBeGreaterThanOrEqual(945);
    expect(winter.sunsetMinutes).toBeLessThanOrEqual(970);
  });

  it('resolves auto mode based on Moscow sunset', () => {
    // 14:00 MSK (11:00 UTC) on 27 Oct -> Day
    const daytime = new Date('2026-10-27T11:00:00Z');
    expect(isMoscowNight(daytime)).toBe(false);
    expect(resolveTheme('auto', daytime)).toBe('day');

    // 18:00 MSK (15:00 UTC) on 27 Oct -> Night (after ~17:01 sunset)
    const evening = new Date('2026-10-27T15:00:00Z');
    expect(isMoscowNight(evening)).toBe(true);
    expect(resolveTheme('auto', evening)).toBe('night');

    // 04:00 MSK (01:00 UTC) on 27 Oct -> Night (before sunrise)
    const earlyMorning = new Date('2026-10-27T01:00:00Z');
    expect(isMoscowNight(earlyMorning)).toBe(true);
    expect(resolveTheme('auto', earlyMorning)).toBe('night');
  });

  it('persists theme mode in localStorage and updates data-theme and meta theme-color', () => {
    expect(getStoredThemeMode()).toBe('auto');

    setThemeMode('night');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('night');
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      THEME_COLOR_BY_RESOLVED.night,
    );

    setThemeMode('day');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('day');
    expect(document.documentElement.getAttribute('data-theme')).toBe('day');
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      THEME_COLOR_BY_RESOLVED.day,
    );
  });

  it('falls back to auto when localStorage contains invalid value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'invalid-mode');
    expect(getStoredThemeMode()).toBe('auto');

    const resolved = initTheme(new Date('2026-10-27T11:00:00Z'));
    expect(resolved).toBe('day');
    expect(document.documentElement.getAttribute('data-theme')).toBe('day');
  });
});
