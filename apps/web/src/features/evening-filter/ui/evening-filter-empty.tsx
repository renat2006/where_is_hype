import type { EveningFilter } from '@where-is-hype/core';
import clsx from 'clsx';

import {
  type FilterRelaxation,
  formatEmptyFilterDescription,
} from '@/features/evening-filter/model/evening-filter-model';
import { Button } from '@/shared/ui/button';
import { Chip, renderWithMonoDigits } from '@/shared/ui/chip';

export interface EveningFilterEmptyProps {
  filter: EveningFilter;
  relaxations?: readonly FilterRelaxation[] | undefined;
  onSelectRelaxation?: ((relaxation: FilterRelaxation) => void) | undefined;
  onReset: () => void;
  className?: string | undefined;
}

export function EveningFilterEmpty({
  filter,
  relaxations = [],
  onSelectRelaxation,
  onReset,
  className,
}: EveningFilterEmptyProps) {
  const description = formatEmptyFilterDescription(filter);

  return (
    <section
      aria-label="Ничего не подошло"
      data-testid="evening-filter-empty-sheet"
      className={clsx(
        'absolute right-0 bottom-0 left-0 z-10 box-border flex min-h-[320px] flex-col gap-2.5 rounded-t-lg border-t-[1.5px] border-ink bg-surface px-5 py-7 text-ink',
        className,
      )}
    >
      <h2 className="m-0 font-display text-[26px] leading-[1.1] font-normal text-ink">
        Ничего не подошло
      </h2>

      <p className="m-0 font-ui text-base leading-6 text-ink">
        {renderWithMonoDigits(description)}
      </p>

      {relaxations.length > 0 && (
        <div
          role="group"
          aria-label="Подсказки ослабить фильтр"
          className="mt-1 flex flex-wrap gap-2"
        >
          {relaxations.map((relaxation) => (
            <Chip
              key={relaxation.id}
              onClick={() => {
                onSelectRelaxation?.(relaxation);
              }}
            >
              {relaxation.label} · {relaxation.count}
            </Chip>
          ))}
        </div>
      )}

      <span className="flex-1" />

      <Button variant="primary" fullWidth onClick={onReset}>
        Сбросить фильтры
      </Button>
    </section>
  );
}
