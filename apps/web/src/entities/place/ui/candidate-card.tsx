import type { Candidate, Location, Place } from '@where-is-hype/core';
import { distanceM as calcDistanceM, formatDistance, placeTypeLabel } from '@where-is-hype/core';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

import { Button } from '@/shared/ui/button';
import { Sticker } from '@/shared/ui/sticker';

export interface CandidateCardProps extends HTMLAttributes<HTMLElement> {
  candidate?: Candidate | Place | undefined;
  place?: Place | undefined;
  index?: number | undefined;
  total?: number | undefined;
  isPrimary?: boolean | undefined;
  alreadySaved?: boolean | undefined;
  isSaved?: boolean | undefined;
  distanceM?: number | null | undefined;
  origin?: Location | null | undefined;
  loading?: boolean | undefined;
  saveLabel?: string | undefined;
  rejectLabel?: string | undefined;
  openLabel?: string | undefined;
  onSave?: ((place: Place) => void) | undefined;
  onReject?: ((place: Place) => void) | undefined;
  onOpen?: ((place: Place) => void) | undefined;
}

function resolveCandidatePlace(
  candidate: Candidate | Place | undefined,
  place: Place | undefined,
): Place {
  if (place) {
    return place;
  }
  if (!candidate) {
    throw new Error('CandidateCard requires either `candidate` or `place` prop.');
  }
  return 'place' in candidate ? candidate.place : candidate;
}

export function CandidateCard({
  candidate,
  place: placeProp,
  index,
  total,
  isPrimary = true,
  alreadySaved,
  isSaved,
  distanceM,
  origin,
  loading = false,
  saveLabel,
  rejectLabel = 'Не то',
  openLabel = 'Открыть',
  onSave,
  onReject,
  onOpen,
  className,
  ...rest
}: CandidateCardProps) {
  const place = resolveCandidatePlace(candidate, placeProp);
  const saved = alreadySaved ?? isSaved ?? false;

  const resolvedDistanceM =
    distanceM === null
      ? null
      : (distanceM ?? (origin ? calcDistanceM(place.location, origin) : place.metro.distanceM));

  if (saved) {
    return (
      <article
        data-candidate-id={place.id}
        data-candidate-state="saved"
        className={clsx(
          'flex items-center gap-3 rounded-md border-[1.5px] border-line bg-surface p-4 text-ink',
          className,
        )}
        {...rest}
      >
        <Sticker type={place.type} size="sm" placeId={place.id} name={place.name} tilt={false} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="truncate font-ui text-base leading-[22px] font-semibold text-ink">
            {place.name}
          </b>
          <span className="text-sm leading-5 text-ink-muted">Уже в твоих местах</span>
        </div>
        {onOpen && (
          <Button
            variant="secondary"
            onClick={() => {
              onOpen(place);
            }}
            className="min-h-11 px-3.5"
          >
            {openLabel}
          </Button>
        )}
      </article>
    );
  }

  if (!isPrimary) {
    return (
      <article
        data-candidate-id={place.id}
        data-candidate-state="secondary"
        className={clsx(
          'flex items-center gap-3 rounded-md border-[1.5px] border-line bg-surface px-4 py-3.5 text-ink',
          className,
        )}
        {...rest}
      >
        <Sticker type={place.type} size="sm" placeId={place.id} name={place.name} tilt={false} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="truncate font-ui text-base leading-[22px] font-semibold text-ink">
            {place.name}
          </b>
          <span className="truncate text-[13px] leading-[18px] text-ink-muted">
            {placeTypeLabel[place.type]} · м. {place.metro.name}
          </span>
        </div>
        <Button
          variant="secondary"
          loading={loading}
          onClick={() => {
            onSave?.(place);
          }}
          className="min-h-11 px-3.5"
        >
          {saveLabel ?? 'Это'}
        </Button>
      </article>
    );
  }

  return (
    <article
      data-candidate-id={place.id}
      data-candidate-state="primary"
      className={clsx(
        'flex flex-col gap-3 rounded-md border-[1.5px] border-ink bg-surface p-4 text-ink',
        className,
      )}
      {...rest}
    >
      <div className="flex items-start gap-3">
        <Sticker type={place.type} size="sm" placeId={place.id} name={place.name} tilt={false} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-ui text-lg leading-6 font-bold text-ink">{place.name}</span>
          <span className="text-sm leading-5 text-ink-muted">
            {placeTypeLabel[place.type]} · {place.address}
            <br />
            м. {place.metro.name}
            {resolvedDistanceM !== null && (
              <>
                {' · '}
                <span className="font-mono text-xs">{formatDistance(resolvedDistanceM)}</span>
              </>
            )}
          </span>
        </div>
        {index !== undefined && total !== undefined && (
          <span className="ml-auto font-mono text-xs text-ink-muted">
            {index}/{total}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          loading={loading}
          loadingLabel="Сохраняем"
          onClick={() => {
            onSave?.(place);
          }}
          className="flex-1"
        >
          {saveLabel ?? 'Да, сохранить'}
        </Button>
        {onReject && (
          <Button
            variant="secondary"
            onClick={() => {
              onReject(place);
            }}
          >
            {rejectLabel}
          </Button>
        )}
      </div>
    </article>
  );
}
