export const PWA_THEME_COLORS = {
  day: '#F4EFE6',
  night: '#16130F',
} as const;

export const PWA_INCLUDE_ASSETS = [
  'favicon.svg',
  'apple-touch-icon.png',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
  'icon-mono.svg',
] as const;

export const PWA_MANIFEST = {
  id: '/',
  name: 'Где Хайп?',
  short_name: 'Где Хайп?',
  description: 'Места из Reels и постов на одной карте',
  lang: 'ru',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: PWA_THEME_COLORS.day,
  theme_color: PWA_THEME_COLORS.day,
  icons: [
    {
      src: '/icon-180.png',
      sizes: '180x180',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icon-512-maskable.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/icon-mono.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'monochrome',
    },
  ],
} as const;

export const PWA_WORKBOX_CONFIG = {
  globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
  navigateFallback: 'index.html',
  navigateFallbackDenylist: [/^\/api\//],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
} as const;
