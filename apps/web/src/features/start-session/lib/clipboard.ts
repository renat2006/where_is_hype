export type ClipboardReadResult =
  { status: 'success'; text: string } | { status: 'empty' } | { status: 'denied' };

export async function readClipboardLink(): Promise<ClipboardReadResult> {
  const clipboard = (navigator as Partial<Pick<Navigator, 'clipboard'>>).clipboard;
  if (!clipboard || typeof clipboard.readText !== 'function') {
    return { status: 'denied' };
  }

  try {
    const rawText = await clipboard.readText();
    const trimmed = rawText.trim();
    if (!trimmed) {
      return { status: 'empty' };
    }
    return { status: 'success', text: trimmed };
  } catch {
    return { status: 'denied' };
  }
}

export function buildAddPlacePath(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '/add';
  }
  return `/add?url=${encodeURIComponent(trimmed)}`;
}
