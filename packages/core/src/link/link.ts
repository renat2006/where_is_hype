import { z } from 'zod';

import { placeSchema } from '../place';

const URL_HOST_PATTERN =
  /^(?:https?:\/\/)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)(?::\d+)?(?:[/?#]|$)/i;

export const platforms = ['instagram', 'tiktok', 'vk', 'telegram', 'youtube', 'other'] as const;

export const platformSchema = z.enum(platforms);
export const sourcePlatformSchema = platformSchema;

export const platformLabel: Record<z.infer<typeof platformSchema>, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  vk: 'ВК',
  telegram: 'Telegram',
  youtube: 'YouTube',
  other: 'Ссылка',
};

export const candidateSchema = z.object({
  place: placeSchema,
  confidence: z.number().min(0).max(1),
});

export type Platform = z.infer<typeof platformSchema>;
export type SourcePlatform = Platform;
export type Candidate = z.infer<typeof candidateSchema>;

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function extractHostname(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const match = URL_HOST_PATTERN.exec(trimmed);
  const host = match?.[1];
  if (!host) {
    return null;
  }

  return host.toLowerCase().replace(/^www\./, '');
}

export function detectPlatform(url: string): Platform {
  const host = extractHostname(url);
  if (!host) {
    return 'other';
  }

  if (matchesDomain(host, 'instagram.com') || matchesDomain(host, 'instagr.am')) {
    return 'instagram';
  }

  if (matchesDomain(host, 'tiktok.com')) {
    return 'tiktok';
  }

  if (
    matchesDomain(host, 'vk.com') ||
    matchesDomain(host, 'vk.ru') ||
    matchesDomain(host, 'vkvideo.ru') ||
    host === 'vk.cc'
  ) {
    return 'vk';
  }

  if (
    matchesDomain(host, 't.me') ||
    matchesDomain(host, 'telegram.me') ||
    matchesDomain(host, 'telegram.org')
  ) {
    return 'telegram';
  }

  if (matchesDomain(host, 'youtube.com') || matchesDomain(host, 'youtu.be')) {
    return 'youtube';
  }

  return 'other';
}
