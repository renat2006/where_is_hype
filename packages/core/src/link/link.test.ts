import { describe, expect, it } from 'vitest';

import { candidateSchema, detectPlatform } from './link';

describe('detectPlatform', () => {
  it('detects Instagram links', () => {
    expect(detectPlatform('https://www.instagram.com/reel/C12345/')).toBe('instagram');
    expect(detectPlatform('https://instagr.am/p/abc')).toBe('instagram');
  });

  it('detects TikTok links including short links without protocol', () => {
    expect(detectPlatform('https://www.tiktok.com/@food/video/123')).toBe('tiktok');
    expect(detectPlatform('vt.tiktok.com/ZS8kQ2pLm')).toBe('tiktok');
    expect(detectPlatform('https://vm.tiktok.com/ZM12345/')).toBe('tiktok');
  });

  it('detects VK links', () => {
    expect(detectPlatform('https://vk.com/clip-123_456')).toBe('vk');
    expect(detectPlatform('https://vkvideo.ru/video-123_456')).toBe('vk');
    expect(detectPlatform('https://vk.ru/wall-1_2')).toBe('vk');
  });

  it('detects Telegram links', () => {
    expect(detectPlatform('https://t.me/moscow_food/42')).toBe('telegram');
    expect(detectPlatform('t.me/s/moscow_food/42')).toBe('telegram');
    expect(detectPlatform('https://telegram.me/channel/10')).toBe('telegram');
  });

  it('detects YouTube links', () => {
    expect(detectPlatform('https://www.youtube.com/shorts/abc123')).toBe('youtube');
    expect(detectPlatform('https://youtu.be/abc123')).toBe('youtube');
  });

  it('returns other for unknown domains or invalid inputs', () => {
    expect(detectPlatform('https://dzen.ru/video/watch/123')).toBe('other');
    expect(detectPlatform('not a valid url')).toBe('other');
    expect(detectPlatform('')).toBe('other');
  });
});

describe('candidateSchema', () => {
  const samplePlace = {
    id: 'sosny',
    name: 'Сосны',
    type: 'rest' as const,
    address: 'Большая Никитская, 12',
    metro: { name: 'Охотный Ряд', distanceM: 450 },
    location: { lat: 55.7572, lng: 37.6091 },
    hours: null,
    avgCheck: 2500,
    yandexOrgId: null,
  };

  it('accepts a valid candidate with confidence between 0 and 1', () => {
    const candidate = { place: samplePlace, confidence: 0.92 };
    expect(candidateSchema.parse(candidate)).toEqual(candidate);
  });

  it('rejects confidence outside [0, 1]', () => {
    expect(candidateSchema.safeParse({ place: samplePlace, confidence: 1.2 }).success).toBe(false);
    expect(candidateSchema.safeParse({ place: samplePlace, confidence: -0.1 }).success).toBe(false);
  });
});
