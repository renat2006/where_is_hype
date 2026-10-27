import { describe, expect, it } from 'vitest';

import { demoSeedPlacesFixture } from '@/shared/api';

import {
  buildFilterRelaxations,
  consumeRememberedEveningFilterSearch,
  defaultEveningFilter,
  filterEveningItems,
  formatEmptyFilterDescription,
  getAvailableEveningHours,
  getEveningHourChipOptions,
  parseEveningFilterSearchParams,
  rememberEveningFilterSearch,
  resetEveningFilterMemory,
  serializeEveningFilterSearchParams,
} from './evening-filter-model';

describe('evening-filter-model', () => {
  const afternoonMoscow = new Date('2026-10-27T15:00:00+03:00');
  const evening8pmMoscow = new Date('2026-10-27T20:15:00+03:00');

  it('hides past hours today and keeps future evening hours in getAvailableEveningHours', () => {
    expect(getAvailableEveningHours(afternoonMoscow)).toEqual([18, 19, 20, 21, 22, 23]);
    expect(getAvailableEveningHours(evening8pmMoscow)).toEqual([21, 22, 23]);

    const optionsAt8pm = getEveningHourChipOptions(evening8pmMoscow);
    expect(optionsAt8pm.map((o) => o.value)).toEqual(['now', '21:00', '22:00', '23:00']);
  });

  it('parses and serializes URL search params for evening filter', () => {
    const parsedDefault = parseEveningFilterSearchParams('');
    expect(parsedDefault).toEqual({
      filter: defaultEveningFilter,
      isOpen: false,
      isActive: false,
    });

    const parsedOpenOnly = parseEveningFilterSearchParams('?filter=1');
    expect(parsedOpenOnly).toEqual({
      filter: defaultEveningFilter,
      isOpen: true,
      isActive: false,
    });

    const parsedActive = parseEveningFilterSearchParams(
      '?filter=1&at=19:00&types=cafe,restaurant&maxCheck=1500&nearMetro=1',
    );
    expect(parsedActive).toEqual({
      filter: {
        at: 19,
        types: ['cafe', 'rest'],
        maxCheck: 1500,
        nearMetro: true,
      },
      isOpen: true,
      isActive: true,
    });

    const serialized = serializeEveningFilterSearchParams(parsedActive.filter, {
      isOpen: false,
      isActive: true,
    });
    expect(serialized.toString()).toBe('at=19&types=cafe%2Crest&maxCheck=1500&nearMetro=1');
  });

  it('filters demoSeedPlacesFixture at 19:00 up to 1500 ₽ and marks unknown hours without hiding them', () => {
    const result = filterEveningItems(
      demoSeedPlacesFixture,
      {
        at: 19,
        types: [],
        maxCheck: 1500,
        nearMetro: false,
      },
      afternoonMoscow,
    );

    expect(result.matchedItems).toHaveLength(4);
    expect(result.matchedPlaceIds.has('zhuravli')).toBe(true);
    expect(result.mutedPlaceIds.has('sosny')).toBe(true);
    expect(result.mutedPlaceIds.has('zerno')).toBe(true);
  });

  it('formats Screen 10 empty description and builds relaxation suggestions with counts', () => {
    const strictFilter = {
      at: 23 as const,
      types: ['bar' as const],
      maxCheck: 1000,
      nearMetro: true,
    };

    expect(formatEmptyFilterDescription(strictFilter)).toBe(
      'В 23:00 бар до 1000 ₽ у метро не нашёлся. Сбросить фильтры?',
    );

    const relaxations = buildFilterRelaxations(
      demoSeedPlacesFixture,
      strictFilter,
      afternoonMoscow,
    );

    expect(relaxations.length).toBeGreaterThan(0);
    expect(relaxations[0]).toMatchObject({
      id: 'without-check',
      label: 'Без «до 1000 ₽»',
    });
    expect(relaxations[0]?.count).toBeGreaterThan(0);
  });

  it('remembers and consumes filter search string for card back-navigation', () => {
    resetEveningFilterMemory();
    rememberEveningFilterSearch('?filter=1&at=19&maxCheck=1500');
    expect(consumeRememberedEveningFilterSearch()).toBe('at=19&maxCheck=1500');
    expect(consumeRememberedEveningFilterSearch()).toBeNull();
  });
});
