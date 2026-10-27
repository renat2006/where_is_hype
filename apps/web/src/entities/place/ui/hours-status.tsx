import type { HoursStatus as HoursStatusValue, WeeklyHours } from '@where-is-hype/core';
import { hoursStatus as resolveHoursStatus } from '@where-is-hype/core';
import clsx from 'clsx';
import { CircleHelp, CircleMinus, Clock } from 'lucide-react';
import type { HTMLAttributes } from 'react';

export type HoursStatusKind = HoursStatusValue['kind'];

export interface HoursStatusProps extends HTMLAttributes<HTMLSpanElement> {
  status?: HoursStatusValue | null | undefined;
  hours?: WeeklyHours | null | undefined;
  at?: Date | undefined;
  kind?: HoursStatusKind | undefined;
  until?: string | undefined;
  opensAt?: string | undefined;
  time?: string | undefined;
}

function normalizeStatus(props: {
  status?: HoursStatusValue | null | undefined;
  hours?: WeeklyHours | null | undefined;
  at?: Date | undefined;
  kind?: HoursStatusKind | undefined;
  until?: string | undefined;
  opensAt?: string | undefined;
  time?: string | undefined;
}): HoursStatusValue {
  if (props.status) {
    return props.status;
  }

  if (props.kind === 'open') {
    return {
      kind: 'open',
      until: props.until ?? props.time ?? '',
    };
  }

  if (props.kind === 'closed') {
    return {
      kind: 'closed',
      opensAt: props.opensAt ?? props.time ?? '',
    };
  }

  if (props.kind === 'unknown') {
    return { kind: 'unknown' };
  }

  if (props.hours !== undefined) {
    return resolveHoursStatus(props.hours, props.at ?? new Date());
  }

  return { kind: 'unknown' };
}

export function HoursStatus({
  status,
  hours,
  at,
  kind,
  until,
  opensAt,
  time,
  className,
  ...rest
}: HoursStatusProps) {
  const resolved = normalizeStatus({ status, hours, at, kind, until, opensAt, time });

  return (
    <span
      data-status-kind={resolved.kind}
      className={clsx(
        'box-border inline-flex min-h-[26px] items-center gap-1.5 rounded-pill px-2.5 py-0.5 font-ui text-[13px] leading-tight font-medium whitespace-nowrap',
        resolved.kind === 'open' && 'bg-status-open text-st-ink',
        resolved.kind === 'closed' && 'bg-status-closed text-ink',
        resolved.kind === 'unknown' &&
          'border-[1.5px] border-dashed border-ink bg-status-unknown text-ink',
        className,
      )}
      {...rest}
    >
      {resolved.kind === 'open' && (
        <Clock
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          data-status-icon="open"
          className="shrink-0"
        />
      )}
      {resolved.kind === 'closed' && (
        <CircleMinus
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          data-status-icon="closed"
          className="shrink-0"
        />
      )}
      {resolved.kind === 'unknown' && (
        <CircleHelp
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          data-status-icon="unknown"
          className="shrink-0"
        />
      )}

      {resolved.kind === 'open' && (
        <span>
          {resolved.until ? (
            <>
              Открыто до <span className="font-mono text-xs">{resolved.until}</span>
            </>
          ) : (
            'Открыто'
          )}
        </span>
      )}

      {resolved.kind === 'closed' && (
        <span>
          {resolved.opensAt ? (
            <>
              Закрыто, откроется в <span className="font-mono text-xs">{resolved.opensAt}</span>
            </>
          ) : (
            'Закрыто'
          )}
        </span>
      )}

      {resolved.kind === 'unknown' && <span>Часы не уточнены</span>}
    </span>
  );
}
