import { type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { z } from 'zod';

export const themeModeSchema = z.enum(['auto', 'day', 'night']);

export type ThemeMode = z.infer<typeof themeModeSchema>;
export type ResolvedTheme = 'day' | 'night';

export const THEME_STORAGE_KEY = 'where-is-hype:theme';

export const THEME_COLOR_BY_RESOLVED: Record<ResolvedTheme, string> = {
  day: '#F4EFE6',
  night: '#16130F',
};

const MOSCOW_LAT = 55.7558;
const MOSCOW_LNG = 37.6173;
const MOSCOW_OFFSET_MINUTES = 180;
const ZENITH_DEGREES = 90.833;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function getMoscowShiftedDate(date: Date): Date {
  return new Date(date.getTime() + MOSCOW_OFFSET_MINUTES * 60_000);
}

function getDayOfYearInMoscow(date: Date): { dayOfYear: number; daysInYear: number } {
  const moscow = getMoscowShiftedDate(date);
  const year = moscow.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const currentDay = Date.UTC(year, moscow.getUTCMonth(), moscow.getUTCDate());
  const dayOfYear = Math.floor((currentDay - startOfYear) / 86_400_000) + 1;
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

  return {
    dayOfYear,
    daysInYear: isLeapYear ? 366 : 365,
  };
}

export function getMoscowMinutesOfDay(date: Date): number {
  const moscow = getMoscowShiftedDate(date);
  return moscow.getUTCHours() * 60 + moscow.getUTCMinutes();
}

export function getMoscowSunTimes(date: Date): {
  sunriseMinutes: number;
  sunsetMinutes: number;
} {
  const { dayOfYear, daysInYear } = getDayOfYearInMoscow(date);
  const gamma = ((2 * Math.PI) / daysInYear) * (dayOfYear - 1);

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const latRad = MOSCOW_LAT * DEG_TO_RAD;
  const zenithRad = ZENITH_DEGREES * DEG_TO_RAD;

  const cosHourAngle =
    Math.cos(zenithRad) / (Math.cos(latRad) * Math.cos(decl)) - Math.tan(latRad) * Math.tan(decl);

  const clampedCos = Math.min(1, Math.max(-1, cosHourAngle));
  const hourAngleDeg = Math.acos(clampedCos) * RAD_TO_DEG;

  const sunriseUtcMinutes = 720 - 4 * (MOSCOW_LNG + hourAngleDeg) - eqTime;
  const sunsetUtcMinutes = 720 - 4 * (MOSCOW_LNG - hourAngleDeg) - eqTime;

  return {
    sunriseMinutes: Math.round(sunriseUtcMinutes + MOSCOW_OFFSET_MINUTES),
    sunsetMinutes: Math.round(sunsetUtcMinutes + MOSCOW_OFFSET_MINUTES),
  };
}

export function isMoscowNight(date: Date = new Date()): boolean {
  const { sunriseMinutes, sunsetMinutes } = getMoscowSunTimes(date);
  const currentMinutes = getMoscowMinutesOfDay(date);
  return currentMinutes >= sunsetMinutes || currentMinutes < sunriseMinutes;
}

export function resolveTheme(mode: ThemeMode, now: Date = new Date()): ResolvedTheme {
  if (mode === 'day') {
    return 'day';
  }
  if (mode === 'night') {
    return 'night';
  }
  return isMoscowNight(now) ? 'night' : 'day';
}

export function getStoredThemeMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    const parsed = themeModeSchema.safeParse(raw);
    return parsed.success ? parsed.data : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyThemeToDocument(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute('data-theme', resolved);

  const color = THEME_COLOR_BY_RESOLVED[resolved];
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = color;
}

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setThemeMode(mode: ThemeMode, now: Date = new Date()): ResolvedTheme {
  const validMode = themeModeSchema.parse(mode);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, validMode);
  } catch {
    // Ignore storage write errors in restricted environments
  }
  const resolved = resolveTheme(validMode, now);
  applyThemeToDocument(resolved);
  emitChange();
  return resolved;
}

export function initTheme(now: Date = new Date()): ResolvedTheme {
  const mode = getStoredThemeMode();
  const resolved = resolveTheme(mode, now);
  applyThemeToDocument(resolved);
  return resolved;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
} {
  const mode = useSyncExternalStore<ThemeMode>(subscribe, getStoredThemeMode, () => 'auto');
  const resolvedTheme = resolveTheme(mode);

  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  return {
    mode,
    resolvedTheme,
    setMode: (nextMode: ThemeMode) => {
      setThemeMode(nextMode);
    },
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { mode } = useTheme();

  useEffect(() => {
    initTheme();
    if (mode !== 'auto') {
      return;
    }

    const timer = window.setInterval(() => {
      const resolved = resolveTheme('auto');
      applyThemeToDocument(resolved);
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [mode]);

  return children;
}
