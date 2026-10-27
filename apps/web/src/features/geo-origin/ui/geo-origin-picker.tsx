import clsx from 'clsx';
import { Check, ChevronLeft } from 'lucide-react';
import { type HTMLAttributes, useState } from 'react';

import {
  DEFAULT_METRO_STATION_ID,
  filterMetroStations,
  findMetroStationById,
  formatMetroOriginCta,
} from '@/features/geo-origin/model/geo-origin-model';
import { Button } from '@/shared/ui/button';
import { MetroStation } from '@/shared/ui/sticker';
import { TextField } from '@/shared/ui/text-field';

export interface GeoOriginPickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  selectedStationId?: string | null | undefined;
  onConfirm?: ((stationId: string) => void) | undefined;
  onRequestGeolocation?: (() => void) | undefined;
  onBack?: (() => void) | undefined;
  loading?: boolean | undefined;
}

export function GeoOriginPicker({
  selectedStationId,
  onConfirm,
  onRequestGeolocation,
  onBack,
  loading = false,
  className,
  ...rest
}: GeoOriginPickerProps) {
  const initialStationId = selectedStationId ?? DEFAULT_METRO_STATION_ID;
  const [activeStationId, setActiveStationId] = useState<string>(initialStationId);
  const [searchQuery, setSearchQuery] = useState('');

  const stations = filterMetroStations(searchQuery, activeStationId);
  const activeStation =
    findMetroStationById(activeStationId) ??
    stations[0] ??
    findMetroStationById(DEFAULT_METRO_STATION_ID);

  const ctaLabel = activeStation
    ? formatMetroOriginCta(activeStation.name)
    : 'Считать от «Чистых прудов»';

  return (
    <section
      aria-label="Выбор станции метро"
      className={clsx(
        'mx-auto box-border flex min-h-full w-full max-w-[430px] flex-1 flex-col bg-bg text-ink',
        className,
      )}
      {...rest}
    >
      {onBack && (
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <Button
            variant="map"
            aria-label="Назад"
            onClick={onBack}
            className="h-11 min-h-11 w-11 min-w-11 px-0 py-0"
          >
            <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
      )}

      <div className={clsx('flex flex-1 flex-col gap-4 px-4 pb-4', onBack ? 'pt-2' : 'pt-4')}>
        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 font-display text-[26px] leading-[1.1] font-normal text-ink">
            От какого метро считать?
          </h2>
          <p className="m-0 font-ui text-[15px] leading-[22px] text-ink-muted">
            Без геолокации покажем расстояния от станции. Поменять можно в любой момент.
          </p>
        </div>

        <TextField
          variant="search"
          aria-label="Станция метро"
          placeholder="Станция метро"
          value={searchQuery}
          onValueChange={setSearchQuery}
        />

        <span className="font-mono text-xs leading-4 text-ink-muted">ВНУТРИ САДОВОГО</span>

        <div
          role="radiogroup"
          aria-label="Станция"
          className="overflow-hidden rounded-md border-[1.5px] border-line bg-surface"
        >
          {stations.length > 0 ? (
            stations.map((station, index) => {
              const isSelected = station.id === activeStation?.id;
              return (
                <button
                  key={station.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setActiveStationId(station.id);
                  }}
                  className={clsx(
                    'box-border flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-3.5 text-left font-ui text-base text-ink transition-colors duration-150 ease-out focus-visible:outline-[2.5px] focus-visible:-outline-offset-2 focus-visible:outline-ink',
                    index > 0 && 'border-t-[1.5px] border-line',
                    isSelected
                      ? 'bg-line font-semibold'
                      : 'bg-surface font-normal hover:bg-line/50',
                  )}
                >
                  <MetroStation variant="badge" aria-hidden="true" />
                  <span className="flex-1">{station.name}</span>
                  {isSelected && (
                    <Check size={20} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
                  )}
                </button>
              );
            })
          ) : (
            <div className="px-3.5 py-4 text-sm text-ink-muted">Станция не найдена</div>
          )}
        </div>

        <span className="flex-1" />

        <Button
          variant="primary"
          fullWidth
          loading={loading}
          disabled={!activeStation}
          onClick={() => {
            if (activeStation) {
              onConfirm?.(activeStation.id);
            }
          }}
        >
          {ctaLabel}
        </Button>

        {onRequestGeolocation && (
          <Button
            variant="text"
            onClick={onRequestGeolocation}
            disabled={loading}
            className="self-center"
          >
            Разрешить геолокацию
          </Button>
        )}
      </div>
    </section>
  );
}
