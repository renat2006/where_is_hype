import type { EveningFilter, PlaceType } from '@where-is-hype/core';
import clsx from 'clsx';
import { type KeyboardEvent, useEffect } from 'react';

import { EVENING_PLACE_TYPE_OPTIONS } from '@/features/evening-filter/model/evening-filter-model';
import { Button } from '@/shared/ui/button';
import { ChipGroup } from '@/shared/ui/chip-group';
import { Switch } from '@/shared/ui/switch';

import { HourPicker } from './hour-picker';
import { PricePicker } from './price-picker';

export interface EveningFilterSheetProps {
  filter: EveningFilter;
  matchedCount: number;
  totalCount: number;
  now?: Date | undefined;
  onUpdate: (patch: Partial<EveningFilter>) => void;
  onReset: () => void;
  onApply: () => void;
  onClose?: (() => void) | undefined;
  className?: string | undefined;
}

export function EveningFilterSheet({
  filter,
  matchedCount,
  totalCount,
  now,
  onUpdate,
  onReset,
  onApply,
  onClose,
  className,
}: EveningFilterSheetProps) {
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        (onClose ?? onApply)();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onApply, onClose]);

  const handleContainerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      (onClose ?? onApply)();
    }
  };

  return (
    <div
      data-testid="evening-filter-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          (onClose ?? onApply)();
        }
      }}
      className={clsx(
        'fixed inset-0 z-30 mx-auto flex max-w-[430px] flex-col justify-end bg-scrim text-ink',
        className,
      )}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Фильтр «На вечер»"
        data-testid="evening-filter-sheet"
        onKeyDown={handleContainerKeyDown}
        className="mt-6 box-border flex max-h-[calc(100%-24px)] flex-1 flex-col gap-3 rounded-t-lg border-t-[1.5px] border-ink bg-surface px-4 pt-2 pb-4 text-ink"
      >
        <div className="flex shrink-0 justify-center pt-1">
          <span aria-hidden="true" className="h-1 w-9 rounded-[4px] bg-ink-muted" />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 className="m-0 font-display text-2xl leading-[30px] font-normal text-ink">
            На вечер
          </h2>
          <Button
            variant="text"
            onClick={onReset}
            className="min-h-11 px-2 text-base font-semibold"
          >
            Сбросить
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
          <HourPicker
            value={filter.at}
            now={now}
            onChange={(at) => {
              onUpdate({ at });
            }}
          />

          <div className="flex flex-col gap-2">
            <b className="font-ui text-[15px] leading-5 font-semibold text-ink">Тип</b>
            <ChipGroup<PlaceType>
              multiple
              ariaLabel="Тип"
              options={EVENING_PLACE_TYPE_OPTIONS}
              value={filter.types}
              onChange={(types) => {
                onUpdate({ types });
              }}
            />
          </div>

          <PricePicker
            value={filter.maxCheck}
            onChange={(maxCheck) => {
              onUpdate({ maxCheck });
            }}
          />

          <Switch
            checked={filter.nearMetro}
            onChange={(nearMetro) => {
              onUpdate({ nearMetro });
            }}
            label="Рядом с метро, до 1 км"
          />

          <span className="flex-1" />

          <p className="m-0 font-ui text-[13px] leading-[18px] text-ink-muted">
            Места без часов или чека не прячем, а помечаем «не уточнено».
          </p>
        </div>

        <Button
          variant="primary"
          fullWidth
          data-testid="evening-filter-submit"
          onClick={onApply}
          className="shrink-0"
        >
          Показать <span className="font-mono text-[15px]">{matchedCount}</span> из{' '}
          <span className="font-mono text-[15px]">{totalCount}</span>
        </Button>
      </section>
    </div>
  );
}
