import type { PlaceMetro, PlaceType } from '@where-is-hype/core';
import { placeTypeLabel } from '@where-is-hype/core';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export interface PlaceTypeLabelProps extends HTMLAttributes<HTMLSpanElement> {
  type: PlaceType;
  metro?: string | PlaceMetro | null | undefined;
  withMetroPrefix?: boolean | undefined;
  address?: string | null | undefined;
  visited?: boolean | undefined;
}

export function PlaceTypeLabel({
  type,
  metro,
  withMetroPrefix = false,
  address,
  visited = false,
  className,
  ...rest
}: PlaceTypeLabelProps) {
  const metroName = typeof metro === 'string' ? metro.trim() : metro?.name.trim();
  const formattedMetro = metroName ? (withMetroPrefix ? `м. ${metroName}` : metroName) : undefined;
  const formattedAddress = address?.trim() ? address.trim() : undefined;

  return (
    <span
      data-place-type={type}
      className={clsx('font-ui text-sm leading-5 text-ink-muted', className)}
      {...rest}
    >
      {placeTypeLabel[type]}
      {formattedAddress && <> · {formattedAddress}</>}
      {formattedMetro && <> · {formattedMetro}</>}
      {visited && (
        <>
          {' · '}
          <b className="font-semibold text-ink">был здесь</b>
        </>
      )}
    </span>
  );
}
