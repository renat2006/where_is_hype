import type { Location, Place } from '@where-is-hype/core';
import {
  detectPlatform,
  distanceM as calcDistanceM,
  formatDistance,
  placeTypeLabel,
  platformLabel,
} from '@where-is-hype/core';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

import { Sticker } from '@/shared/ui/sticker';

import { HoursStatus } from './hours-status';

export interface PlaceCardProps extends HTMLAttributes<HTMLElement> {
  place: Place;
  sourceUrl?: string | null | undefined;
  origin?: Location | null | undefined;
  at?: Date | undefined;
}

function normalizeSourceHref(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function PlaceCard({ place, sourceUrl, origin, at, className, ...rest }: PlaceCardProps) {
  const hasAddress = place.address.trim().length > 0;
  const hasMetro = place.metro.name.trim().length > 0;
  const hasHours = place.hours !== null;
  const cleanSourceUrl = sourceUrl?.trim() ?? '';
  const distanceMeters = origin
    ? calcDistanceM(place.location, origin)
    : hasMetro && place.metro.distanceM > 0
      ? place.metro.distanceM
      : null;

  return (
    <article
      data-place-id={place.id}
      className={clsx(
        'flex flex-col gap-2.5 rounded-md border-[1.5px] border-line bg-surface p-4 text-ink',
        className,
      )}
      {...rest}
    >
      <div className="flex items-start gap-3">
        <Sticker type={place.type} size="sm" placeId={place.id} name={place.name} tilt={false} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="m-0 font-display text-lg leading-6 font-semibold text-ink">
            {place.name}
          </h2>
          <p className="m-0 text-sm leading-5 text-ink-muted">
            <span>{placeTypeLabel[place.type]}</span>
            {hasAddress && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{place.address}</span>
              </>
            )}
          </p>
          {(hasMetro || distanceMeters !== null) && (
            <p className="m-0 text-sm leading-5 text-ink-muted">
              {hasMetro && <span>м. {place.metro.name}</span>}
              {hasMetro && distanceMeters !== null && <span aria-hidden="true"> · </span>}
              {distanceMeters !== null && (
                <span className="font-mono text-xs">{formatDistance(distanceMeters)}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {hasHours && <HoursStatus hours={place.hours} at={at} className="self-start" />}

      {cleanSourceUrl.length > 0 && (
        <a
          href={normalizeSourceHref(cleanSourceUrl)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="place-card-source-link"
          className="inline-flex items-center gap-1.5 self-start font-ui text-xs leading-4 font-semibold text-link underline underline-offset-2 hover:text-ink"
        >
          <span>Исходный ролик · {platformLabel[detectPlatform(cleanSourceUrl)]} ↗</span>
        </a>
      )}
    </article>
  );
}
