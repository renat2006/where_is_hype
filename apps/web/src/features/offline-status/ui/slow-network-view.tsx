import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

import {
  SLOW_NETWORK_THRESHOLD_MS,
  useSlowLoading,
} from '@/features/offline-status/model/offline-status-model';
import { Logo } from '@/shared/ui/logo';
import { OfflineBanner } from '@/shared/ui/offline-banner';
import { PlaceRowSkeleton, Skeleton } from '@/shared/ui/skeleton';

export interface SlowNetworkViewProps extends HTMLAttributes<HTMLElement> {
  isLoading?: boolean | undefined;
  showSlowHint?: boolean | undefined;
  slowThresholdMs?: number | undefined;
  headingTitle?: string | undefined;
  fullScreen?: boolean | undefined;
}

export function SlowNetworkView({
  isLoading = true,
  showSlowHint,
  slowThresholdMs = SLOW_NETWORK_THRESHOLD_MS,
  headingTitle = 'Мои места',
  fullScreen = false,
  className,
  ...rest
}: SlowNetworkViewProps) {
  const timedSlow = useSlowLoading(isLoading, slowThresholdMs);
  const shouldShowHint = showSlowHint ?? timedSlow;

  return (
    <section
      aria-label={headingTitle}
      aria-busy={isLoading || undefined}
      data-testid="slow-network-view"
      className={clsx(
        'mx-auto box-border flex min-h-dvh w-full max-w-[430px] flex-col gap-3.5 bg-bg p-4 text-ink',
        fullScreen && 'fixed inset-0 z-30 overflow-y-auto',
        className,
      )}
      {...rest}
    >
      <h1 className="sr-only">{headingTitle}</h1>

      <div className="flex items-center">
        <Logo variant="compact" />
      </div>

      <Skeleton
        data-testid="slow-network-map-skeleton"
        height={260}
        className="w-full shrink-0 rounded-md"
      />

      <div
        data-testid="slow-network-rows-skeleton"
        className="flex flex-col gap-3.5"
        aria-hidden="true"
      >
        <PlaceRowSkeleton />
        <div
          data-testid="skeleton-place-row"
          className="flex items-center gap-3"
          aria-hidden="true"
        >
          <div className="h-9 w-9 shrink-0 rounded-full bg-line" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-[60%] rounded-sm bg-line" />
            <div className="h-3 w-[40%] rounded-sm bg-line" />
          </div>
        </div>
      </div>

      <div data-testid="slow-network-hint-slot" className="min-h-[44px]">
        {shouldShowHint && <OfflineBanner variant="slow" />}
      </div>
    </section>
  );
}
