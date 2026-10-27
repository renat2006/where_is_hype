import clsx from 'clsx';
import type { SVGProps } from 'react';

import { MARKER_OVAL_PATHS, type MarkerOvalVariant, TAPE_POLYGON_POINTS } from './decor-paths';

export interface MarkerOvalProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  variant?: MarkerOvalVariant | undefined;
  inverted?: boolean | undefined;
}

export function MarkerOval({
  variant = 1,
  inverted = false,
  width = 120,
  height = 80,
  className,
  ...rest
}: MarkerOvalProps) {
  return (
    <svg
      viewBox="0 0 120 80"
      width={width}
      height={height}
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-decor="marker-oval"
      data-variant={variant}
      className={clsx(
        'pointer-events-none select-none',
        inverted ? 'text-ink' : 'text-marker',
        className,
      )}
      {...rest}
    >
      <path
        d={MARKER_OVAL_PATHS[variant]}
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="round"
      />
    </svg>
  );
}

export type StrikeVariant = 'text' | 'sticker';

export interface StrikeProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  variant?: StrikeVariant | undefined;
  inverted?: boolean | undefined;
}

export function Strike({
  variant = 'text',
  inverted = false,
  width,
  height,
  className,
  ...rest
}: StrikeProps) {
  if (variant === 'sticker') {
    return (
      <svg
        viewBox="0 0 64 40"
        width={width ?? 64}
        height={height ?? 40}
        fill="none"
        aria-hidden="true"
        focusable="false"
        data-decor="strike"
        data-variant="sticker"
        data-inverted={inverted ? 'true' : 'false'}
        className={clsx('pointer-events-none select-none', className)}
        {...rest}
      >
        <path
          d="M4 30 C 20 24 40 16 60 8"
          fill="none"
          stroke={inverted ? '#FFFDF8' : 'var(--color-st-ink)'}
          strokeWidth={8}
          strokeLinecap="round"
        />
        <path
          d="M4 30 C 20 24 40 16 60 8"
          fill="none"
          stroke={inverted ? 'var(--color-st-ink)' : 'var(--color-marker)'}
          strokeWidth={5}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 120 30"
      width={width ?? 124}
      height={height ?? 30}
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-decor="strike"
      data-variant="text"
      data-inverted={inverted ? 'true' : 'false'}
      className={clsx(
        'pointer-events-none select-none',
        inverted ? 'text-ink' : 'text-marker',
        className,
      )}
      {...rest}
    >
      <path
        d="M2 20 C 30 14 70 12 118 8"
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="round"
      />
    </svg>
  );
}

export type ArrowHandProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

export function ArrowHand({ width = 110, height = 92, className, ...rest }: ArrowHandProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      width={width}
      height={height}
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-decor="arrow-hand"
      className={clsx('pointer-events-none text-ink select-none', className)}
      {...rest}
    >
      <path
        d="M8 14 C 44 4 92 22 96 78"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path
        d="M80 66 L 96 82 L 110 62"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type TapeProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

export function Tape({ width = 88, height = 26, className, ...rest }: TapeProps) {
  return (
    <svg
      viewBox="0 0 88 26"
      width={width}
      height={height}
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-decor="tape"
      className={clsx('pointer-events-none select-none', className)}
      {...rest}
    >
      <polygon points={TAPE_POLYGON_POINTS} fill="var(--color-tape)" />
    </svg>
  );
}
