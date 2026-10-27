export type AvatarStickerColor = 'coffee' | 'cafe' | 'rest';

export const AVATAR_STICKER_COLORS: readonly AvatarStickerColor[] = ['coffee', 'cafe', 'rest'];

export const AVATAR_BG_CLASS_BY_COLOR: Record<AvatarStickerColor, string> = {
  coffee: 'bg-st-coffee',
  cafe: 'bg-st-cafe',
  rest: 'bg-st-rest',
};

export interface AvatarPerson {
  id?: string;
  name: string;
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? '';
    const second = parts[1]?.[0] ?? '';
    return `${first}${second}`.toUpperCase();
  }

  const single = parts[0] ?? '';
  if (single.length <= 2) {
    return single.toUpperCase();
  }
  return (single[0] ?? '?').toUpperCase();
}

export function getAvatarColorByName(name: string): AvatarStickerColor {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return 'coffee';
  }

  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    const weight = i % 2 === 0 ? 2 : 1;
    hash += code * weight + 1;
  }

  const index = Math.abs(hash) % AVATAR_STICKER_COLORS.length;
  return AVATAR_STICKER_COLORS[index] ?? 'coffee';
}
