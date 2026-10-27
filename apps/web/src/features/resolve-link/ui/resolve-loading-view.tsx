import clsx from 'clsx';
import { X } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { Sticker } from '@/shared/ui/sticker';

import { RESOLVE_LOADING_STEPS } from './resolve-link-flow';

export interface ResolveLoadingViewProps {
  loadingStep: 1 | 2 | 3;
  isSlow: boolean;
  onCancel: () => void;
  onSwitchToSearch: () => void;
}

export function ResolveLoadingView({
  loadingStep,
  isSlow,
  onCancel,
  onSwitchToSearch,
}: ResolveLoadingViewProps) {
  return (
    <section className="flex min-h-[520px] flex-1 flex-col justify-between gap-6">
      <div className="flex items-center gap-2">
        <Button
          variant="map"
          aria-label="Отменить"
          onClick={onCancel}
          className="h-11 min-h-11 w-11 min-w-11 px-0 py-0"
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </Button>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="my-auto flex flex-col items-center justify-center gap-6 py-6 text-center"
      >
        <div className="flex h-20 items-end gap-3.5" aria-hidden="true">
          <Sticker type="coffee" size="md" tilt={-4} className="-translate-y-1" />
          <Sticker type="rest" size="md" tilt={4} className="-translate-y-4" />
          <Sticker type="bar" size="md" tilt={-2} className="-translate-y-0.5" />
        </div>

        <h2 className="m-0 font-display text-[28px] leading-[1.1] font-normal text-ink">
          Смотрим ролик…
        </h2>

        <div className="flex flex-col gap-2 text-[15px] leading-5">
          {RESOLVE_LOADING_STEPS.map((item) => {
            const isCompleted = item.step === 1 || item.step < loadingStep;
            const isCurrent = item.step === loadingStep;
            const isMuted = item.step > loadingStep;

            return (
              <span
                key={item.step}
                data-step={item.indexLabel}
                data-active={isCurrent || isCompleted ? 'true' : 'false'}
                className={clsx(isMuted ? 'text-ink-muted' : 'text-ink')}
              >
                <span className="font-mono text-xs">{item.indexLabel}</span> {item.label}
                {isCompleted ? ' ✓' : ''}
              </span>
            );
          })}
        </div>

        <span className="font-mono text-xs leading-4 text-ink-muted">до 5 с</span>

        {isSlow && (
          <div className="flex flex-col items-center gap-3 px-4">
            <p className="m-0 text-sm leading-5 text-ink-muted">
              Долго думаем. Подождём ещё или найдём по названию?
            </p>
            <Button variant="secondary" onClick={onSwitchToSearch}>
              Найти по названию
            </Button>
          </div>
        )}
      </div>

      <div aria-hidden="true" className="h-4" />
    </section>
  );
}
