import type { Place, VisitExpectation } from '@where-is-hype/core';
import { Check, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId } from 'react';

import {
  clampVisitComment,
  DEMO_PROXIMITY_TOGGLE_LABEL,
  type DemoProximity,
  EXPECTATION_OPTIONS,
  isPrefersReducedMotion,
  MAX_NOTE_LENGTH,
  VISIT_VERIFICATION_RADIUS_M,
} from '@/features/mark-visit/model/mark-visit-model';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Sticker } from '@/shared/ui/sticker';

const MOTION_STRIKE_CSS = `
@keyframes zin-motion-strike {
  from {
    stroke-dashoffset: 120;
  }
  to {
    stroke-dashoffset: 0;
  }
}
[data-motion-strike='animate'] svg[data-decor='strike'] path {
  stroke-dasharray: 120;
  animation: zin-motion-strike var(--motion-strike, 400ms ease-in-out) 1 both;
}
@media (prefers-reduced-motion: reduce) {
  [data-motion-strike='animate'] svg[data-decor='strike'] path {
    animation: none !important;
    stroke-dashoffset: 0 !important;
  }
}
`;

export interface MarkVisitModalProps {
  open: boolean;
  place: Place;
  verified: boolean;
  visitedCount: number;
  totalCount: number;
  expectation: VisitExpectation | null;
  comment: string;
  isSubmitting?: boolean | undefined;
  demoMode?: boolean | undefined;
  demoProximity?: DemoProximity | undefined;
  reducedMotion?: boolean | undefined;
  onSelectExpectation: (value: VisitExpectation) => void;
  onChangeComment: (value: string) => void;
  onToggleDemoProximity?: (() => void) | undefined;
  onFinish: () => void;
  onClose: () => void;
}

export function MarkVisitModal({
  open,
  place,
  verified,
  visitedCount,
  totalCount,
  expectation,
  comment,
  isSubmitting = false,
  demoMode = false,
  demoProximity = 'near',
  reducedMotion: reducedMotionProp,
  onSelectExpectation,
  onChangeComment,
  onToggleDemoProximity,
  onFinish,
  onClose,
}: MarkVisitModalProps) {
  const titleId = useId();
  const commentId = useId();
  const reducedMotion = isPrefersReducedMotion(reducedMotionProp);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const handleContainerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="mark-visit-modal"
      data-verified={verified ? 'true' : 'false'}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      onKeyDown={handleContainerKeyDown}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg text-ink"
    >
      <style>{MOTION_STRIKE_CSS}</style>

      <div className="mx-auto flex min-h-dvh w-full max-w-[26.875rem] flex-col gap-4 p-4">
        <header className="flex items-center">
          <button
            type="button"
            aria-label="Закрыть"
            data-testid="mark-visit-close"
            onClick={onClose}
            className="box-border inline-flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 cursor-pointer items-center justify-center rounded-pill border-[1.5px] border-ink bg-glass text-ink transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-ink active:bg-line"
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-3 pt-2 text-center"
        >
          <div
            data-testid="mark-visit-strike-container"
            data-motion-strike={reducedMotion ? 'reduced' : 'animate'}
            className="relative flex h-20 w-24 items-center justify-center"
          >
            <Sticker
              type={place.type}
              state="visited"
              size="xl"
              placeId={place.id}
              name={place.name}
              tilt={-2}
              data-testid="mark-visit-sticker"
            />
          </div>

          <h2
            id={titleId}
            data-testid="mark-visit-title"
            className="m-0 font-display text-[1.625rem] leading-[1.1] font-normal text-ink"
          >
            Визит отмечен
          </h2>

          {verified ? (
            <span
              data-testid="mark-visit-verification"
              data-verified="true"
              className="box-border inline-flex min-h-[1.625rem] items-center gap-1.5 rounded-pill bg-status-open px-2.5 py-1 font-ui text-[0.8125rem] leading-none font-medium text-st-ink"
            >
              <Check size={14} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
              <span>
                подтверждён · рядом, до{' '}
                <span className="font-mono text-[0.6875rem]">{VISIT_VERIFICATION_RADIUS_M} м</span>
              </span>
            </span>
          ) : (
            <span
              data-testid="mark-visit-verification"
              data-verified="false"
              className="box-border inline-flex min-h-[1.625rem] items-center gap-1.5 rounded-pill border-[1.5px] border-dashed border-ink bg-transparent px-2.5 py-1 font-ui text-[0.8125rem] leading-none font-medium text-ink"
            >
              <span>
                без проверки · ты дальше{' '}
                <span className="font-mono text-[0.6875rem]">{VISIT_VERIFICATION_RADIUS_M} м</span>
              </span>
            </span>
          )}

          <span
            data-testid="mark-visit-counter"
            className="font-ui text-sm leading-5 text-ink-muted"
          >
            {place.name} · был в{' '}
            <span className="font-mono text-xs">
              {visitedCount} из {totalCount}
            </span>
          </span>
        </div>

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 font-ui text-[1.125rem] leading-6 font-bold text-ink">
            Совпало с ожиданиями?
          </legend>

          <div className="grid grid-cols-3 gap-2">
            {EXPECTATION_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                selected={expectation === option.value}
                onClick={() => {
                  onSelectExpectation(option.value);
                }}
                data-testid={`expectation-chip-${option.value}`}
                className="w-full justify-center px-2"
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor={commentId} className="font-ui text-sm leading-5 font-semibold text-ink">
            Пара слов <span className="font-normal text-ink-muted">необязательно</span>
          </label>

          <textarea
            id={commentId}
            rows={3}
            maxLength={MAX_NOTE_LENGTH}
            value={comment}
            onChange={(event) => {
              onChangeComment(clampVisitComment(event.target.value));
            }}
            placeholder="Что запомнилось?"
            data-testid="mark-visit-comment"
            className="box-border w-full resize-none rounded-md border-[1.5px] border-ink bg-surface px-3.5 py-3 font-ui text-base leading-6 text-ink placeholder:text-ink-muted focus-visible:outline-[2.5px] focus-visible:outline-offset-[2px] focus-visible:outline-ink"
          />
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <Button
            variant="primary"
            fullWidth
            loading={isSubmitting}
            onClick={onFinish}
            data-testid="mark-visit-submit"
          >
            Готово
          </Button>

          {demoMode && onToggleDemoProximity && (
            <Button
              variant="text"
              onClick={onToggleDemoProximity}
              aria-pressed={demoProximity === 'far'}
              data-testid="mark-visit-demo-toggle"
              data-demo-proximity={demoProximity}
              className="self-center text-sm text-ink-muted"
            >
              <span>{DEMO_PROXIMITY_TOGGLE_LABEL}</span>
              <span className="sr-only">
                {demoProximity === 'near'
                  ? ' (переключить — Демо: я далеко)'
                  : ' (переключить — Демо: я рядом)'}
              </span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
