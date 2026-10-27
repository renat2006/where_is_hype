import type { PlaceType } from '@where-is-hype/core';
import clsx from 'clsx';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

import { MarkerOval, type MarkerOvalVariant, Strike } from '@/shared/ui/decor';

import {
  formatStickerAriaLabel,
  getStickerTilt,
  type StickerSize,
  type StickerState,
} from './sticker-tilt';

const STICKER_BG_CLASS: Record<PlaceType, string> = {
  coffee: 'bg-st-coffee',
  cafe: 'bg-st-cafe',
  rest: 'bg-st-rest',
  bar: 'bg-st-bar',
};

const STICKER_OVAL_VARIANT: Record<PlaceType, MarkerOvalVariant> = {
  coffee: 1,
  cafe: 2,
  rest: 3,
  bar: 1,
};

const STICKER_SIZE_CONFIG: Record<
  StickerSize,
  {
    circleClass: string;
    iconSize: number;
    ovalWidth: number;
    ovalHeight: number;
    strikeWidth: number;
    strikeHeight: number;
  }
> = {
  sm: {
    circleClass: 'h-9 w-9',
    iconSize: 18,
    ovalWidth: 76,
    ovalHeight: 58,
    strikeWidth: 54,
    strikeHeight: 34,
  },
  md: {
    circleClass: 'h-11 w-11',
    iconSize: 22,
    ovalWidth: 92,
    ovalHeight: 70,
    strikeWidth: 64,
    strikeHeight: 40,
  },
  lg: {
    circleClass: 'h-14 w-14',
    iconSize: 26,
    ovalWidth: 96,
    ovalHeight: 76,
    strikeWidth: 76,
    strikeHeight: 48,
  },
  xl: {
    circleClass: 'h-16 w-16',
    iconSize: 28,
    ovalWidth: 112,
    ovalHeight: 88,
    strikeWidth: 96,
    strikeHeight: 56,
  },
};

function PlaceTypeIcon({
  type,
  size,
  unknown = false,
}: {
  type: PlaceType;
  size: number;
  unknown?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {type === 'coffee' && (
        <>
          <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
          <path d="M6 2v2M10 2v2M14 2v2" />
        </>
      )}
      {type === 'cafe' && (
        <>
          <path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z" />
          <path d="M7 21h10" />
          <path d="M19.5 12 22 6" />
          {!unknown && <path d="M9 3c.5 1 .5 2 0 3s-.5 2 0 3M13 3c.5 1 .5 2 0 3s-.5 2 0 3" />}
        </>
      )}
      {type === 'rest' && (
        <>
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </>
      )}
      {type === 'bar' && (
        <>
          <path d="M8 22h8" />
          <path d="M7 10h10" />
          <path d="M12 15v7" />
          <path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z" />
        </>
      )}
    </svg>
  );
}

function EveningFlag({ inverted }: { inverted: boolean }) {
  return (
    <svg
      width={20}
      height={24}
      viewBox="0 0 20 24"
      aria-hidden="true"
      focusable="false"
      data-sticker-flag="true"
      className="pointer-events-none absolute -top-3 -right-2.5 select-none"
    >
      <path d="M3 23V2" stroke="#17140F" strokeWidth={2} strokeLinecap="round" />
      <path
        d="M3 2h14l-4 5 4 5H3z"
        fill={inverted ? '#FFFDF8' : 'var(--color-marker)'}
        stroke="#17140F"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function resolveTiltAngle(tilt: boolean | number | string | undefined, fallbackId: string): number {
  if (tilt === undefined || tilt === false) {
    return 0;
  }
  if (typeof tilt === 'number') {
    return Math.max(-4, Math.min(4, tilt));
  }
  if (typeof tilt === 'string') {
    return getStickerTilt(tilt);
  }
  return getStickerTilt(fallbackId);
}

export interface StickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'id'> {
  type: PlaceType;
  state?: StickerState | undefined;
  size?: StickerSize | undefined;
  id?: string | undefined;
  placeId?: string | undefined;
  name?: string | undefined;
  label?: string | undefined;
  tilt?: boolean | number | string | undefined;
  inEvening?: boolean | undefined;
  badge?: ReactNode | undefined;
}

export function Sticker({
  type,
  state = 'default',
  size = 'md',
  id,
  placeId,
  name,
  label,
  tilt = false,
  inEvening = false,
  badge,
  className,
  style,
  children,
  'aria-label': ariaLabelProp,
  'aria-hidden': ariaHidden,
  ...rest
}: StickerProps) {
  const effectiveSize: StickerSize = state === 'selected' && size === 'md' ? 'lg' : size;
  const sizeConfig = STICKER_SIZE_CONFIG[effectiveSize];
  const seedId = placeId ?? id ?? name ?? type;
  const tiltAngle = resolveTiltAngle(tilt, seedId);
  const isBar = type === 'bar';
  const isUnknown = state === 'unknown';
  const showFlag = state === 'evening' || inEvening;

  const computedAriaLabel =
    ariaLabelProp ?? label ?? formatStickerAriaLabel(type, state, { name, inEvening });

  const circleStyle: CSSProperties | undefined =
    tiltAngle !== 0 ? { transform: `rotate(${String(tiltAngle)}deg)` } : undefined;

  const content = children ?? badge ?? (
    <PlaceTypeIcon type={type} size={sizeConfig.iconSize} unknown={isUnknown} />
  );

  return (
    <div
      id={id}
      role={ariaHidden === true || ariaHidden === 'true' ? undefined : 'img'}
      aria-label={ariaHidden === true || ariaHidden === 'true' ? undefined : computedAriaLabel}
      aria-hidden={ariaHidden}
      data-sticker-type={type}
      data-sticker-state={state}
      data-sticker-size={effectiveSize}
      data-tilt={tiltAngle}
      style={style}
      className={clsx('relative inline-flex shrink-0 items-center justify-center', className)}
      {...rest}
    >
      <div
        data-sticker-circle="true"
        style={circleStyle}
        className={clsx(
          'relative box-border flex shrink-0 items-center justify-center rounded-full text-st-ink',
          sizeConfig.circleClass,
          isUnknown
            ? 'border-2 border-dashed border-[#17140F] bg-[#FFFDF8] shadow-[0_0_0_3px_#FFFFFF,0_0_0_4.5px_#17140F]'
            : [
                STICKER_BG_CLASS[type],
                'border-[3px] border-white shadow-[0_0_0_1.5px_#17140F,0_3px_0_1.5px_#17140F]',
              ],
        )}
      >
        {content}
        {showFlag && <EveningFlag inverted={isBar} />}
      </div>

      {(state === 'selected' || (showFlag && effectiveSize !== 'sm')) && (
        <MarkerOval
          variant={STICKER_OVAL_VARIANT[type]}
          inverted={isBar}
          width={sizeConfig.ovalWidth}
          height={sizeConfig.ovalHeight}
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        />
      )}

      {state === 'visited' && (
        <Strike
          variant="sticker"
          inverted={isBar}
          width={sizeConfig.strikeWidth}
          height={sizeConfig.strikeHeight}
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        />
      )}
    </div>
  );
}

export const PlaceSticker = Sticker;

function pluralizePlaces(count: number): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 19) {
    return 'мест';
  }
  if (mod10 === 1) {
    return 'место';
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return 'места';
  }
  return 'мест';
}

export interface StickerClusterProps extends HTMLAttributes<HTMLDivElement> {
  count: number;
  maxCount?: number | undefined;
  surfaceTop?: boolean | undefined;
  types?: readonly [PlaceType?, PlaceType?, PlaceType?] | undefined;
  label?: string | undefined;
}

export function StickerCluster({
  count,
  maxCount = 40,
  surfaceTop,
  types,
  label,
  className,
  'aria-label': ariaLabelProp,
  ...rest
}: StickerClusterProps) {
  const isOverflow = count >= maxCount;
  const displayCount = isOverflow ? `${String(maxCount)}+` : String(count);
  const useSurfaceTop = surfaceTop ?? isOverflow;

  const firstType = types?.[0] ?? 'rest';
  const secondType = types?.[1] ?? (isOverflow ? 'bar' : 'cafe');
  const thirdType = types?.[2] ?? 'coffee';

  const computedAriaLabel =
    ariaLabelProp ?? label ?? `Кластер: ${displayCount} ${pluralizePlaces(count)}`;

  const circleBaseClass =
    'box-border flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white text-st-ink shadow-[0_0_0_1.5px_#17140F,0_3px_0_1.5px_#17140F]';

  return (
    <div
      role="img"
      aria-label={computedAriaLabel}
      data-cluster-count={displayCount}
      className={clsx('relative inline-block h-[60px] w-[72px] shrink-0 select-none', className)}
      {...rest}
    >
      <div
        aria-hidden="true"
        style={{ transform: 'rotate(-8deg)' }}
        className={clsx('absolute top-2.5 left-1', circleBaseClass, STICKER_BG_CLASS[firstType])}
      />
      <div
        aria-hidden="true"
        style={{ transform: 'rotate(5deg)' }}
        className={clsx(
          'absolute top-1 left-[18px]',
          circleBaseClass,
          STICKER_BG_CLASS[secondType],
        )}
      />
      <div
        aria-hidden="true"
        style={{ transform: 'rotate(-3deg)' }}
        className={clsx(
          'absolute top-3 left-[30px]',
          circleBaseClass,
          useSurfaceTop ? 'bg-[#FFFDF8]' : STICKER_BG_CLASS[thirdType],
        )}
      >
        <span
          className={clsx(
            'font-mono leading-none font-semibold text-st-ink',
            isOverflow ? 'text-[13px]' : 'text-[14px]',
          )}
        >
          {displayCount}
        </span>
      </div>
    </div>
  );
}

export const ClusterSticker = StickerCluster;
export const MapCluster = StickerCluster;

export interface MyLocationDotProps extends HTMLAttributes<HTMLDivElement> {
  label?: string | undefined;
}

export function MyLocationDot({
  label,
  className,
  'aria-label': ariaLabelProp,
  ...rest
}: MyLocationDotProps) {
  const computedAriaLabel = ariaLabelProp ?? label ?? 'Моя точка';

  return (
    <div
      role="img"
      aria-label={computedAriaLabel}
      data-my-location="true"
      className={clsx(
        'relative inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center select-none',
        className,
      )}
      {...rest}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-14 w-14 rounded-full bg-marker/16"
      />
      <div
        aria-hidden="true"
        className="relative box-border h-5 w-5 rounded-full border-4 border-surface bg-ink shadow-[0_0_0_1.5px_var(--color-ink)]"
      />
    </div>
  );
}

export const MyPoint = MyLocationDot;
export const UserLocationDot = MyLocationDot;

export type MetroStationVariant = 'origin' | 'map' | 'badge';

export interface MetroStationProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | undefined;
  variant?: MetroStationVariant | undefined;
  label?: string | undefined;
}

export function MetroStation({
  name,
  variant,
  label,
  className,
  'aria-label': ariaLabelProp,
  ...rest
}: MetroStationProps) {
  const resolvedVariant: MetroStationVariant = variant ?? (name ? 'origin' : 'map');
  const computedAriaLabel =
    ariaLabelProp ?? label ?? (name ? `Станция метро ${name}` : 'Станция метро');

  if (resolvedVariant === 'badge') {
    return (
      <div
        role="img"
        aria-label={computedAriaLabel}
        data-metro-variant="badge"
        className={clsx(
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink font-display text-[13px] leading-none text-surface select-none',
          className,
        )}
        {...rest}
      >
        <span aria-hidden="true">М</span>
      </div>
    );
  }

  if (resolvedVariant === 'map') {
    return (
      <div
        role="img"
        aria-label={computedAriaLabel}
        data-metro-variant="map"
        className={clsx('inline-flex items-center gap-1 text-ink select-none', className)}
        {...rest}
      >
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink" />
        <span aria-hidden="true" className="font-mono text-xs leading-none">
          М
        </span>
        {name && <span className="text-xs font-medium">{name}</span>}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={computedAriaLabel}
      data-metro-variant="origin"
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-pill border-[1.5px] border-ink bg-surface py-1.5 pr-2.5 pl-1.5 text-ink select-none',
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink font-display text-[13px] leading-none text-surface"
      >
        М
      </span>
      {name && <span className="text-[13px] leading-none font-semibold">{name}</span>}
    </div>
  );
}

export const MetroPin = MetroStation;
export const MetroBadge = MetroStation;
