import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PWA_INCLUDE_ASSETS,
  PWA_MANIFEST,
  PWA_THEME_COLORS,
  PWA_WORKBOX_CONFIG,
  registerAppServiceWorker,
  resolveActiveThemeColor,
  syncThemeColorMeta,
} from './index';

describe('app/pwa', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.remove();
    }
    vi.restoreAllMocks();
  });

  it('defines web app manifest with name «Где Хайп?», icons from public, and Zin theme colors', () => {
    expect(PWA_MANIFEST.name).toBe('Где Хайп?');
    expect(PWA_MANIFEST.short_name).toBe('Где Хайп?');
    expect(PWA_MANIFEST.lang).toBe('ru');
    expect(PWA_MANIFEST.display).toBe('standalone');
    expect(PWA_MANIFEST.theme_color).toBe('#F4EFE6');
    expect(PWA_MANIFEST.background_color).toBe('#F4EFE6');

    const iconSources = PWA_MANIFEST.icons.map((icon) => icon.src);
    expect(iconSources).toEqual([
      '/icon-180.png',
      '/icon-192.png',
      '/icon-512.png',
      '/icon-512-maskable.png',
      '/icon-mono.svg',
    ]);

    expect(PWA_INCLUDE_ASSETS).toContain('favicon.svg');
    expect(PWA_INCLUDE_ASSETS).toContain('apple-touch-icon.png');
    expect(PWA_WORKBOX_CONFIG.navigateFallback).toBe('index.html');
  });

  it('syncs <meta name="theme-color"> for day and night themes', () => {
    expect(resolveActiveThemeColor()).toBe(PWA_THEME_COLORS.day);

    const dayColor = syncThemeColorMeta('day');
    expect(dayColor).toBe('#F4EFE6');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#F4EFE6',
    );

    document.documentElement.setAttribute('data-theme', 'night');
    const nightColor = syncThemeColorMeta();
    expect(nightColor).toBe('#16130F');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#16130F',
    );
  });

  it('registers service worker when enabled and skips when disabled', async () => {
    const mockRegistration = { scope: '/' } as ServiceWorkerRegistration;
    const registerSpy = vi.fn().mockResolvedValue(mockRegistration);

    const skipped = await registerAppServiceWorker({
      enabled: false,
      serviceWorkerContainer: { register: registerSpy },
    });
    expect(skipped).toBeNull();
    expect(registerSpy).not.toHaveBeenCalled();

    const registered = await registerAppServiceWorker({
      enabled: true,
      swUrl: '/sw.js',
      scope: '/',
      serviceWorkerContainer: { register: registerSpy },
    });
    expect(registered).toBe(mockRegistration);
    expect(registerSpy).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('returns null gracefully if service worker registration rejects', async () => {
    const registerSpy = vi.fn().mockRejectedValue(new Error('SW failed'));

    const result = await registerAppServiceWorker({
      enabled: true,
      serviceWorkerContainer: { register: registerSpy },
    });

    expect(result).toBeNull();
  });
});
