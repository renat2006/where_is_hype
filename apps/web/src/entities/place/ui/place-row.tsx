import type {
  HoursStatus as HoursStatusValue,
  Location,
  Place,
  SavedPlace,
  Visit,
} from '@where-is-hype/core';
import { distanceM as calcDistanceM, formatDistance } from '@where-is-hype/core';
import clsx from 'clsx';
import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react';

import { Sticker, type StickerState } from '@/shared/ui/sticker';

import { HoursStatus } from './hours-status';
import { PlaceTypeLabel } from './place-type-label';

export interface PlaceRowProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  place: Place | SavedPlace;
  status?: HoursStatusValue | null | undefined;
  at?: Date | undefined;
  distanceM?: number | null | undefined;
  distance?: string | null | undefined;
  origin?: Location | null | undefined;
  visited?: boolean | undefined;
  visits?: readonly Visit[] | undefined;
  inEvening?: boolean | undefined;
  stickerState?: StickerState | undefined;
  showHours?: boolean | undefined;
  href?: string | undefined;
  onClick?: MouseEventHandler<HTMLElement> | undefined;
  action?: ReactNode | undefined;
  trailing?: ReactNode | undefined;
}

function extractPlace(item: Place | SavedPlace): Place {
  return 'place' in item ? item.place : item;
}

function extractVisited(
  item: Place | SavedPlace,
  visitedProp: boolean | undefined,
  visitsProp: readonly Visit[] | undefined,
): boolean {
  if (visitedProp !== undefined) {
    return visitedProp;
  }
  if (visitsProp !== undefined) {
    return visitsProp.length > 0;
  }
  if ('visits' in item) {
    return item.visits.length > 0;
  }
  return false;
}

function resolveDistanceText(
  place: Place,
  distanceMProp: number | null | undefined,
  distanceProp: string | null | undefined,
  origin: Location | null | undefined,
): string | null {
  if (distanceProp !== undefined) {
    return distanceProp;
  }
  if (distanceMProp === null) {
    return null;
  }
  if (typeof distanceMProp === 'number') {
    return formatDistance(distanceMProp);
  }
  if (origin) {
    return formatDistance(calcDistanceM(place.location, origin));
  }
  return formatDistance(place.metro.distanceM);
}

export function PlaceRow({
  place: placeOrSaved,
  status,
  at,
  distanceM,
  distance,
  origin,
  visited,
  visits,
  inEvening = false,
  stickerState,
  showHours = true,
  href,
  onClick,
  action,
  trailing,
  className,
  ...rest
}: PlaceRowProps) {
  const place = extractPlace(placeOrSaved);
  const isVisited = extractVisited(placeOrSaved, visited, visits);
  const resolvedStickerState: StickerState =
    stickerState ?? (isVisited ? 'visited' : inEvening ? 'evening' : 'default');
  const distanceText = resolveDistanceText(place, distanceM, distance, origin);
  const trailingSlot = action ?? trailing;

  const rowClasses = clsx(
    'box-border flex w-full items-center gap-3 border-b-[1.5px] border-line bg-surface px-4 py-3 text-left text-ink no-underline transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:-outline-offset-2 focus-visible:outline-ink',
    (href !== undefined || onClick !== undefined) &&
      'cursor-pointer hover:bg-line/40 active:bg-line',
    className,
  );

  const innerContent = (
    <>
      <Sticker
        type={place.type}
        state={resolvedStickerState}
        size="sm"
        placeId={place.id}
        name={place.name}
        tilt={false}
        inEvening={inEvening}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            data-testid="place-row-name"
            className="min-w-0 flex-1 truncate font-ui text-base leading-[22px] font-semibold text-ink"
          >
            {place.name}
          </span>

          {distanceText !== null && (
            <span
              data-testid="place-row-distance"
              className="shrink-0 font-mono text-xs leading-4 text-ink"
            >
              {distanceText}
            </span>
          )}
        </div>

        <PlaceTypeLabel
          type={place.type}
          metro={place.metro}
          visited={isVisited}
          className="truncate text-[13px] leading-[18px]"
        />

        {showHours && (
          <HoursStatus status={status} hours={place.hours} at={at} className="self-start" />
        )}
      </div>

      {trailingSlot !== undefined && <div className="shrink-0">{trailingSlot}</div>}
    </>
  );

  if (href !== undefined && trailingSlot === undefined) {
    return (
      <a
        href={href}
        onClick={onClick}
        data-place-id={place.id}
        data-visited={isVisited ? 'true' : 'false'}
        className={rowClasses}
        {...rest}
      >
        {innerContent}
      </a>
    );
  }

  if (onClick !== undefined && trailingSlot === undefined) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-place-id={place.id}
        data-visited={isVisited ? 'true' : 'false'}
        className={rowClasses}
        {...rest}
      >
        {innerContent}
      </button>
    );
  }

  return (
    <article
      onClick={onClick}
      data-place-id={place.id}
      data-visited={isVisited ? 'true' : 'false'}
      className={rowClasses}
      {...rest}
    >
      {innerContent}
    </article>
  );
}
