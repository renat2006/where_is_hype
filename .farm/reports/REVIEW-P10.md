# REVIEW-P10 — отчёт

Статус: готово

## Прогресс (новые сверху, время ЧЧ:ММ)

- 15:11 — Завершено ревью ветки `agents/P10`. Все критерии US4 выполнены, тесты и линтеры зелены, дизайн-система «Зин» соблюдена. Вердикт: принять.
- 15:10 — Проверены визуальные скриншоты экранов 09, 09b и 10 в дневной и ночной теме (360×780) в `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P10-shots/`.
- 15:09 — Выполнены независимые проверки: `pnpm check` (Prettier, ESLint, Steiger FSD, TypeScript, Vitest 140 тестов) и `pnpm --filter @where-is-hype/web build` — всё успешно без ошибок.
- 15:08 — Изучена реализация `apps/web/src/features/evening-filter` и подключение в `apps/web/src/pages/my-places`. Проверен git diff и соответствие зоне задачи.
- 15:04 — Начало ревью. Прочитана задача P10, отчёт автора, git log и diff stat.

## Вердикт

Вердикт: принять

## Замечания

### P0 (критические блокеры)

Замечаний нет.

### P1 (нарушения дизайн-системы / функциональные дефекты)

Замечаний нет.

### P2 (незначительные улучшения и рекомендации)

- [`apps/web/src/features/evening-filter/model/evening-filter-model.ts:43`](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P10/apps/web/src/features/evening-filter/model/evening-filter-model.ts#L43-L61): Запоминание query-параметров фильтра для возврата из карточки места (`rememberedFilterSearch`) реализовано в оперативной памяти модуля. Для клиентской навигации (React Router / `popstate`) этого достаточно, но при жёсткой перезагрузке страницы внутри карточки места (`Ctrl+R`) модуль перезагрузится. Если в будущем потребуется сохранять фильтр даже после жесткой перезагрузки страницы карточки, можно будет дублировать значение в `sessionStorage`.
- [`apps/web/src/features/evening-filter/ui/hour-picker.tsx:48`](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P10/apps/web/src/features/evening-filter/ui/hour-picker.tsx#L48-L52): В `HourPicker` предусмотрена подсказка `showHint` («только сегодня · шаг 1 час · прошедшие часы скрыты»), но в `EveningFilterSheet` она отключена для разгрузки интерфейса. Это соответствует правилу «чище, чем на холсте».

## Решения и наблюдения

- **Соответствие задаче P10 и US4 (`docs/product/mvp-scope.md`)**:
  - `features/evening-filter`: выбор времени («Сейчас» или часы 18:00..23:00 сегодня с автоматическим скрытием прошедших часов в Москве); множественный выбор типов мест (`coffee`, `cafe`, `rest`, `bar`); фильтр среднего чека до 1000/1500/2500/4000 ₽ с возможностью сброса; переключатель «Рядом с метро, до 1 км».
  - Состояние фильтра хранится в query-параметрах (`at`, `types`, `maxCheck`, `nearMetro`, `filter=1`) и восстанавливается при возврате из карточки места.
  - Карта и список обновляются реактивно. На карте неподходящие места приглушаются полупрозрачностью (`opacity: 0.35`). В списке неподходящие скрываются, а места с не указанными часами или чеком не отсекаются, а помечаются плашкой «Часы не уточнены» / подписью «не уточнено».
  - При отсутствии совпадений отображается экран 10: точный заголовок «Ничего не подошло», связный текст с моноширинными цифрами, чипы для ослабления одного из условий с количеством подходящих мест и кнопка «Сбросить фильтры».
  - Отправляется аналитическое событие `filter_applied`.
- **Чистота дизайн-системы «Зин»**:
  - На экранах ровно одна главная кнопка `btn-primary` («Показать N из M» в шторке, «Сбросить фильтры» на пустом экране).
  - Никаких рукописных шрифтов, скотча или наклонов в фильтрах, списках и формах.
  - Цифры в кнопках, часах, ценах и чипах оформлены моноширинным шрифтом `font-mono`.
  - Отличная читаемость и контрастность в дневной и ночной темах при ширине 360 px.
- **Доступность**:
  - Шторка фильтра имеет `role="dialog"`, `aria-modal="true"`, закрывается по `Escape` и клику на оверлей.
  - Группы чипов снабжены `role="group"` и `aria-label`, чипы имеют `aria-pressed`.
  - Переключатель метро реализован через доступный `role="switch"` с `aria-checked`.
- **Зона файлов**:
  - Изменения выполнены строго в разрешённой зоне: `apps/web/src/features/evening-filter` и `apps/web/src/pages/my-places`. Чужие файлы не затронуты.

## Проверки (команда → результат)

- `pnpm format:check` → `All matched files use Prettier code style!`
- `pnpm lint` (`eslint . --max-warnings=0`) → `0 errors, 0 warnings`
- `pnpm lint:fsd` (`steiger ./src`) → `✔ No problems found!`
- `pnpm typecheck` (`pnpm -r typecheck`) → `packages/core` и `apps/web` без ошибок
- `pnpm test` (`pnpm -r test`) → 57 test files passed, 140 tests passed
- `pnpm --filter @where-is-hype/web build` → `✓ built in 791ms` (успешная сборка)

## Изменённые файлы

- `apps/web/src/features/evening-filter/index.ts`
- `apps/web/src/features/evening-filter/model/evening-filter-model.ts`
- `apps/web/src/features/evening-filter/model/evening-filter-model.test.ts`
- `apps/web/src/features/evening-filter/ui/hour-picker.tsx`
- `apps/web/src/features/evening-filter/ui/price-picker.tsx`
- `apps/web/src/features/evening-filter/ui/evening-filter-sheet.tsx`
- `apps/web/src/features/evening-filter/ui/evening-filter-empty.tsx`
- `apps/web/src/features/evening-filter/ui/evening-filter.test.tsx`
- `apps/web/src/pages/my-places/ui/my-places-page.tsx`
- `apps/web/src/pages/my-places/ui/my-places-page.test.tsx`

## Скриншоты (360×780, день и ночь)

- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P10-shots/09-evening-filter-sheet-day.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P10-shots/09-evening-filter-sheet-night.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P10-shots/09b-filtered-map-list-day.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P10-shots/09b-filtered-map-list-night.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P10-shots/10-evening-filter-empty-day.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P10-shots/10-evening-filter-empty-night.png`

## Что осталось / риски

- Блокеров и рисков нет. Ветка готова к слиянию в `feat/prototype`.
