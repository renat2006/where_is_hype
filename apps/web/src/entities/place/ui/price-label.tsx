import { formatRubles } from '@where-is-hype/core';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type PriceLabelPrefix = 'чек' | 'до' | '' | null;

export interface PriceLabelProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'prefix'> {
  avgCheck?: number | null | undefined;
  price?: number | null | undefined;
  value?: number | null | undefined;
  prefix?: PriceLabelPrefix | undefined;
  unknownText?: string | undefined;
}

export function PriceLabel({
  avgCheck,
  price,
  value,
  prefix = 'чек',
  unknownText = 'чек не уточнено',
  className,
  ...rest
}: PriceLabelProps) {
  const resolvedAmount = avgCheck ?? price ?? value;

  if (resolvedAmount === null || resolvedAmount === undefined) {
    return (
      <span
        data-price-status="unknown"
        className={clsx('font-ui text-sm leading-5 text-ink-muted', className)}
        {...rest}
      >
        {unknownText}
      </span>
    );
  }

  const formattedRubles = formatRubles(resolvedAmount);

  return (
    <span
      data-price-status="known"
      className={clsx('font-ui text-sm leading-5 text-ink', className)}
      {...rest}
    >
      {prefix ? `${prefix} ` : null}
      <span className="font-mono text-[13px]">{formattedRubles}&nbsp;₽</span>
    </span>
  );
}
