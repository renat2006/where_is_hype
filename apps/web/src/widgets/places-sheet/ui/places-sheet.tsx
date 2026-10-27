import type { Location, Place, SavedPlace } from '@where-is-hype/core';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

import { PlaceRow } from '@/entities/place';
import { Sheet, type SheetSnap } from '@/shared/ui/sheet';
import {
  countSheetVisitedPlaces,
  sortSheetPlacesByDistance,
} from '@/widgets/places-sheet/model/places-sheet-model';

export interface PlacesSheetProps extends Omit<HTMLAttributes<HTMLElement>, 'title' | 'onSelect'> {
  places: readonly (Place | SavedPlace)[];
  origin?: Location | null | undefined;
  selectedPlaceId?: string | null | undefined;
  eveningPlaceIds?: readonly string[] | ReadonlySet<string> | undefined;
  visitedCount?: number | undefined;
  totalCount?: number | undefined;
  title?: string | undefined;
  headingLevel?: 1 | 2 | undefined;
  snap?: SheetSnap | undefined;
  defaultSnap?: SheetSnap | undefined;
  onSnapChange?: ((snap: SheetSnap) => void) | undefined;
  onSelectPlace?: ((placeId: string, item: Place | SavedPlace) => void) | undefined;
  getPlaceHref?: ((placeId: string) => string | undefined) | undefined;
  at?: Date | undefined;
}

function isInEveningSet(
  placeId: string,
  eveningPlaceIds: readonly string[] | ReadonlySet<string> | undefined,
): boolean {
  if (!eveningPlaceIds) {
    return false;
  }
  if (Array.isArray(eveningPlaceIds)) {
    return eveningPlaceIds.includes(placeId);
  }
  return (eveningPlaceIds as ReadonlySet<string>).has(placeId);
}

export function PlacesSheet({
  places,
  origin,
  selectedPlaceId,
  eveningPlaceIds,
  visitedCount,
  totalCount,
  title = 'Мои места',
  headingLevel = 1,
  snap,
  defaultSnap = 'half',
  onSnapChange,
  onSelectPlace,
  getPlaceHref,
  at,
  className,
  ...rest
}: PlacesSheetProps) {
  const sortedEntries = sortSheetPlacesByDistance(places, origin);
  const resolvedVisitedCount = visitedCount ?? countSheetVisitedPlaces(places);
  const resolvedTotalCount = totalCount ?? places.length;
  const HeadingTag = headingLevel === 1 ? 'h1' : 'h2';

  const header = (
    <div className="flex items-baseline justify-between gap-2 pb-0.5">
      <HeadingTag className="m-0 font-ui text-lg leading-7 font-bold text-ink">{title}</HeadingTag>
      <span data-testid="places-sheet-summary" className="font-ui text-sm leading-5 text-ink">
        <span className="sr-only">· </span>был в{' '}
        <span className="font-mono text-[13px] font-semibold">
          {resolvedVisitedCount} из {resolvedTotalCount}
        </span>
      </span>
    </div>
  );

  return (
    <Sheet
      {...(snap !== undefined ? { snap } : {})}
      defaultSnap={defaultSnap}
      {...(onSnapChange !== undefined ? { onSnapChange } : {})}
      header={header}
      ariaLabel={title}
      className={className}
      {...rest}
    >
      <div role="list" aria-label={title} className="flex flex-col border-t-[1.5px] border-line">
        {sortedEntries.map(({ item, place, distanceM, visited }) => {
          const isSelected = selectedPlaceId === place.id;
          const inEvening = isInEveningSet(place.id, eveningPlaceIds);
          const href = getPlaceHref?.(place.id);

          return (
            <div key={place.id} role="listitem">
              <PlaceRow
                place={item}
                distanceM={distanceM}
                origin={origin}
                visited={visited}
                inEvening={inEvening}
                at={at}
                href={href}
                data-selected={isSelected ? 'true' : 'false'}
                onClick={
                  onSelectPlace
                    ? (event) => {
                        if (href !== undefined) {
                          event.preventDefault();
                        }
                        onSelectPlace(place.id, item);
                      }
                    : undefined
                }
                className={clsx(isSelected && 'bg-line/50')}
              />
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
