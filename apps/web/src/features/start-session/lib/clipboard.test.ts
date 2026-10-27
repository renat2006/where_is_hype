import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildAddPlacePath, readClipboardLink } from './clipboard';

describe('clipboard utilities', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('builds /add?url=... path with encoded url', () => {
    expect(buildAddPlacePath('  https://www.instagram.com/reel/hype-coffee/  ')).toBe(
      '/add?url=https%3A%2F%2Fwww.instagram.com%2Freel%2Fhype-coffee%2F',
    );
    expect(buildAddPlacePath('   ')).toBe('/add');
  });

  it('returns success when clipboard has non-empty text', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: vi.fn().mockResolvedValue('  https://vt.tiktok.com/ZS8kQ2pLm  '),
      },
      configurable: true,
      writable: true,
    });

    const result = await readClipboardLink();
    expect(result).toEqual({
      status: 'success',
      text: 'https://vt.tiktok.com/ZS8kQ2pLm',
    });
  });

  it('returns empty when clipboard contains only whitespace', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: vi.fn().mockResolvedValue('   '),
      },
      configurable: true,
      writable: true,
    });

    const result = await readClipboardLink();
    expect(result).toEqual({ status: 'empty' });
  });

  it('returns denied when clipboard API throws or is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
      },
      configurable: true,
      writable: true,
    });

    await expect(readClipboardLink()).resolves.toEqual({ status: 'denied' });

    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    await expect(readClipboardLink()).resolves.toEqual({ status: 'denied' });
  });
});
