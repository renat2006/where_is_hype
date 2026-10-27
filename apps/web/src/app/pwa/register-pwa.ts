import { env } from '@/shared/config';

import { PWA_THEME_COLORS } from './pwa-config';

export interface RegisterAppServiceWorkerOptions {
  swUrl?: string | undefined;
  scope?: string | undefined;
  enabled?: boolean | undefined;
  serviceWorkerContainer?: Pick<ServiceWorkerContainer, 'register'> | null | undefined;
}

export function resolveActiveThemeColor(
  theme?: 'day' | 'night',
  doc: Document | null = typeof document !== 'undefined' ? document : null,
): string {
  if (theme === 'night') {
    return PWA_THEME_COLORS.night;
  }
  if (theme === 'day') {
    return PWA_THEME_COLORS.day;
  }
  const attr = doc?.documentElement.getAttribute('data-theme');
  return attr === 'night' ? PWA_THEME_COLORS.night : PWA_THEME_COLORS.day;
}

export function syncThemeColorMeta(
  theme?: 'day' | 'night',
  doc: Document | null = typeof document !== 'undefined' ? document : null,
): string {
  const color = resolveActiveThemeColor(theme, doc);
  if (!doc) {
    return color;
  }

  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'theme-color';
    doc.head.appendChild(meta);
  }
  meta.content = color;
  return color;
}

export async function registerAppServiceWorker(
  options: RegisterAppServiceWorkerOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  const {
    swUrl = '/sw.js',
    scope = '/',
    enabled = import.meta.env.PROD && !env.apiMocks,
    serviceWorkerContainer = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker
      : null,
  } = options;

  if (!enabled || !serviceWorkerContainer) {
    return null;
  }

  try {
    return await serviceWorkerContainer.register(swUrl, { scope });
  } catch {
    return null;
  }
}

let pwaInitialized = false;

export function initPwa(): void {
  if (pwaInitialized || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  pwaInitialized = true;

  syncThemeColorMeta();

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      syncThemeColorMeta();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  void registerAppServiceWorker();
}
