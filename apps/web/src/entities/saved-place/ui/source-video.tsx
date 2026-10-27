import type { Platform, SavedPlace } from '@where-is-hype/core';
import { detectPlatform, platformLabel } from '@where-is-hype/core';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

import { Tape } from '@/shared/ui/decor';

export interface SourceVideoProps extends HTMLAttributes<HTMLDivElement> {
  savedPlace?: Pick<SavedPlace, 'sourceUrl' | 'sourcePlatform'> | null | undefined;
  sourceUrl?: string | null | undefined;
  url?: string | null | undefined;
  platform?: Platform | undefined;
  sourcePlatform?: Platform | undefined;
  displayUrl?: string | undefined;
  showTape?: boolean | undefined;
  hideIfEmpty?: boolean | undefined;
}

function normalizeHref(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function formatCompactUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/\/$/, '');
}

export function SourceVideo({
  savedPlace,
  sourceUrl,
  url,
  platform,
  sourcePlatform,
  displayUrl,
  showTape = true,
  hideIfEmpty = false,
  className,
  ...rest
}: SourceVideoProps) {
  const rawUrl = (sourceUrl ?? url ?? savedPlace?.sourceUrl ?? '').trim();

  if (!rawUrl) {
    if (hideIfEmpty) {
      return null;
    }

    return (
      <div
        data-source-video="empty"
        className={clsx(
          'relative flex items-center gap-3 rounded-sm border-[1.5px] border-line bg-surface px-4 py-3 text-ink',
          className,
        )}
        {...rest}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13px] leading-4 text-ink-muted">Исходный ролик</span>
          <span className="text-sm leading-5 text-ink-muted">Добавлено без ссылки</span>
        </div>
      </div>
    );
  }

  const resolvedPlatform: Platform =
    platform ?? sourcePlatform ?? savedPlace?.sourcePlatform ?? detectPlatform(rawUrl);
  const href = normalizeHref(rawUrl);
  const linkText = displayUrl ?? formatCompactUrl(rawUrl);

  return (
    <div
      data-source-video={resolvedPlatform}
      className={clsx(
        'relative flex items-center gap-3 rounded-sm border-[1.5px] border-ink bg-surface px-4 pt-4 pb-3 text-ink',
        showTape && 'mt-1.5',
        className,
      )}
      {...rest}
    >
      {showTape && <Tape className="absolute -top-[13px] left-6 -rotate-4" />}

      <div
        aria-hidden="true"
        className="flex h-12 w-10 shrink-0 items-center justify-center rounded-sm border-[1.5px] border-st-ink bg-st-coffee text-st-ink"
      >
        <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 5v14l11-7z" fill="currentColor" />
        </svg>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span data-testid="source-video-platform" className="text-[13px] leading-4 text-ink-muted">
          Исходный ролик · {platformLabel[resolvedPlatform]}
        </span>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate font-ui text-[15px] leading-5 font-semibold text-link underline underline-offset-2 hover:text-ink"
        >
          {linkText}
        </a>
      </div>
    </div>
  );
}
