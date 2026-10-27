import { type PlaceType, placeTypeLabel } from '@where-is-hype/core';

export const STICKER_TILT_ANGLES = [-4, -3, -2, 2, 3, 4] as const;

export type StickerTiltAngle = (typeof STICKER_TILT_ANGLES)[number];

export type StickerState = 'default' | 'selected' | 'visited' | 'unknown' | 'evening';

export type StickerSize = 'sm' | 'md' | 'lg' | 'xl';

export function getStickerTilt(id: string): StickerTiltAngle {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = (hash >>> 0) % STICKER_TILT_ANGLES.length;
  return STICKER_TILT_ANGLES[index] ?? -4;
}

const STATE_ARIA_SUFFIX: Record<StickerState, string | null> = {
  default: null,
  selected: 'выбрано',
  visited: 'был здесь',
  unknown: 'не уточнено',
  evening: 'в «На вечер»',
};

export function formatStickerAriaLabel(
  type: PlaceType,
  state: StickerState = 'default',
  options?: { name?: string | undefined; inEvening?: boolean | undefined },
): string {
  const typeText = placeTypeLabel[type];
  const base = options?.name ? `${options.name}, ${typeText}` : typeText;
  const parts: string[] = [base];

  const suffix = STATE_ARIA_SUFFIX[state];
  if (suffix !== null) {
    parts.push(suffix);
  }
  if (options?.inEvening && state !== 'evening') {
    parts.push('в «На вечер»');
  }

  return parts.join(', ');
}
