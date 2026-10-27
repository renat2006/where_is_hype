import clsx from 'clsx';
import { WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';

export type OfflineBannerVariant = 'offline' | 'slow';

export interface OfflineBannerProps {
  variant?: OfflineBannerVariant;
  title?: ReactNode;
  description?: ReactNode;
  showIcon?: boolean;
  className?: string;
}

export function OfflineBanner({
  variant = 'offline',
  title,
  description,
  showIcon,
  className,
}: OfflineBannerProps) {
  const resolvedTitle = title ?? (variant === 'slow' ? 'Сеть медленная.' : 'Нет сети.');
  const resolvedDescription =
    description ?? (variant === 'slow' ? 'Карта догрузится' : 'Показываем сохранённое');
  const shouldShowIcon = showIcon ?? variant === 'offline';

  return (
    <div
      role="status"
      className={clsx(
        'box-border flex items-center gap-2.5 rounded-pill border-[1.5px] border-dashed border-ink bg-surface px-3.5 py-2.5 font-ui text-sm leading-5 text-ink',
        className,
      )}
    >
      {shouldShowIcon && (
        <WifiOff size={18} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ink" />
      )}
      <b className="font-bold text-ink">{resolvedTitle}</b>
      {resolvedDescription && <span className="text-ink-muted">{resolvedDescription}</span>}
    </div>
  );
}
