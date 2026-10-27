import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { msw } from 'msw/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import { PWA_INCLUDE_ASSETS, PWA_MANIFEST, PWA_WORKBOX_CONFIG } from './src/app/pwa/pwa-config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    msw(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [...PWA_INCLUDE_ASSETS],
      manifest: {
        ...PWA_MANIFEST,
        icons: PWA_MANIFEST.icons.map((icon) => ({ ...icon })),
      },
      workbox: {
        ...PWA_WORKBOX_CONFIG,
        globPatterns: [...PWA_WORKBOX_CONFIG.globPatterns],
        navigateFallbackDenylist: [...PWA_WORKBOX_CONFIG.navigateFallbackDenylist],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    css: false,
  },
});
