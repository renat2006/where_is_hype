# REVIEW-P11 — отчёт

Статус: готово

## Прогресс (новые сверху, время ЧЧ:ММ)

- 14:56 — Ревью завершено. Вердикт: принять. Замечаний P0/P1 нет.
- 14:55 — Проверена доступность (aria-label, button/a семантика, aria-hidden на иконках), FSD-импорты (только вниз), отсутствие console.log/TODO/HACK.
- 14:54 — Прочитан полный diff (12 файлов, 1262 строки), скриншоты (9 шт.), отчёт автора, задача. Запущены `pnpm check` и `pnpm build` — оба прошли (46 файлов, 113 тестов). Проведён построчный анализ кода.
- 14:52 — Начало ревью. Чтение задачи P11, отчёта P11, docs/design/README.md, mvp-scope.md.

## Вердикт

**Вердикт: принять**

Работа полностью соответствует задаче P11 и критериям приёмки US5. Все 4 критерия US5 выполнены. Код строго в заданной зоне, FSD-архитектура соблюдена, линтер/тайпчекер/тесты проходят, дизайн-система «Зин» соблюдена. Нет P0 или P1 замечаний.

### Критерии US5 — проверка

| #   | Критерий                                                                 | Статус | Где реализовано                                    |
| --- | ------------------------------------------------------------------------ | ------ | -------------------------------------------------- |
| 1   | Название, тип, адрес, метро, часы (3 варианта), чек, ролик, заметка ≤280 | ✅     | `place-page.tsx` L153–284                          |
| 2   | «Маршрут» → Яндекс Карты (приложение, иначе веб)                         | ✅     | `place-links.ts` L26–81, `place-page.tsx` L139–142 |
| 3   | «Отзывы» → yandexOrgId или поиск                                         | ✅     | `place-links.ts` L83–91, `place-page.tsx` L268–276 |
| 4   | Удаление с 5с тостом и отменой                                           | ✅     | `use-delete-place.ts`, `delete-place-button.tsx`   |

### Дизайн-система «Зин» — проверка правил 1–6

| #   | Правило                    | Статус | Детали                                                                               |
| --- | -------------------------- | ------ | ------------------------------------------------------------------------------------ |
| 1   | Контент первым             | ✅     | Расстояние, название, часы, чек — первые элементы, скриншоты подтверждают            |
| 2   | Один акцент                | ✅     | Декор только у блока ролика (`showTape`), наклейка без поворота (`tilt={false}`)     |
| 3   | Списки/кнопки спокойные    | ✅     | Нет поворотов, скотча, рукописного текста на кнопках/заметке (`handwritten={false}`) |
| 4   | Рамки/тени целенаправленно | ✅     | Одна рамка на секцию адреса, дашированная на заметке — чисто                         |
| 5   | Одна primary               | ✅     | `btn-primary` только на «Маршрут», «Отзывы» — ссылка, «Удалить» — `btn-text`         |
| 6   | Типографика сдержанная     | ✅     | Dela Gothic только на h2 (название места) ≥20px, цифры `font-mono`                   |

### Доступность

| Элемент            | Проверка                                                          | Статус |
| ------------------ | ----------------------------------------------------------------- | ------ |
| Кнопка «Назад»     | `<button type="button" aria-label="Назад">`                       | ✅     |
| Иконка ChevronLeft | `aria-hidden="true"`                                              | ✅     |
| Иконка Navigation  | `aria-hidden="true"`                                              | ✅     |
| Ссылка «Отзывы»    | `<a>` (не button), `target="_blank"`, `rel="noopener noreferrer"` | ✅     |
| Кнопка «Удалить»   | `<Button>` → `<button>`                                           | ✅     |
| Тост удаления      | `role="status"` (из компонента toast)                             | ✅     |
| Textarea заметки   | `aria-label="Моя заметка"`, `<label htmlFor>`                     | ✅     |
| Секции             | `aria-label` на всех `<section>`                                  | ✅     |

### Скриншоты — визуальная проверка

Проверены все 9 скриншотов 360×780:

- **place-day.png / place-night.png** — корректная верстка, контент читается, одна primary кнопка, контраст OK в обеих темах
- **place-long-title-day.png / night** — длинное название (`text-xl`) переносится без обрезки, стикер наверху
- **place-unknown-hours-day.png / night** — «Часы не уточнены» со значком вопроса, пунктир
- **place-delete-toast-day.png / night** — тост над BottomNav, обратный отсчёт, кнопка «Отменить»
- **place-font-200-day.png** — 200% шрифт: блоки переносятся, не обрезаются, кнопка «Маршрут» растёт

### Замечания

#### P2 (рекомендации, не блокируют)

1. **Три отдельных `fallbackQueryClient`** — `place-page.tsx:28`, `use-delete-place.ts:12`, `edit-note.tsx:17` создают три независимых `QueryClient` на уровне модуля. Все с одинаковой конфигурацией. Потенциально создают три раздельных кеша, если нет провайдера. На практике на проде провайдер всегда есть и fallback не используется — только в тестах. Но лучше вынести общий fallback в `@/shared/lib` или использовать один.

2. **Дублирование классов** `text-xl text-[min(1.5rem,36px)]` в `place-page.tsx:198` — `text-xl` фактически перезаписывается следующим arbitrary value `text-[min(...)]`. Служит «документацией», но может запутать. Аналогично `text-2xl text-[min(1.875rem,44px)]` в строке 199.

3. **Широкий public API** `pages/place/index.ts` — экспортируются 11 утилит помимо `PlacePage`. Большинство — внутренние детали реализации (`estimatePlaceTitleLines`, `resolveSavedPlaceForCard`). Рекомендуется в будущем вынести общие утилиты (view transitions, yandex maps links) в `@/shared/lib` и оставить в `index.ts` только `PlacePage` + `PlacePageProps` + `getPlaceViewTransitionName`.

4. **Хардкод даты** в `resolveSavedPlaceForCard` (`place-links.ts:193`): `addedAt: '2026-10-27T12:00:00.000Z'` — фиксированная дата для fallback-конструкции `SavedPlace` из каталога. Не критично для прототипа, но стоит использовать `new Date().toISOString()`.

## Проверки (команда → результат)

- `pnpm check` → **PASS** (prettier, eslint, steiger, typecheck, 46 test files, 113 tests)
- `pnpm build` → **PASS** (packages/core + apps/web, Vite без ошибок)

## Изменённые файлы (все в зоне задачи)

- `apps/web/src/pages/place/index.ts`
- `apps/web/src/pages/place/ui/place-page.tsx`
- `apps/web/src/pages/place/ui/place-links.ts`
- `apps/web/src/pages/place/ui/place-page.test.tsx`
- `apps/web/src/features/edit-note/index.ts`
- `apps/web/src/features/edit-note/ui/edit-note.tsx`
- `apps/web/src/features/edit-note/ui/edit-note-utils.ts`
- `apps/web/src/features/edit-note/ui/edit-note.test.tsx`
- `apps/web/src/features/delete-place/index.ts`
- `apps/web/src/features/delete-place/ui/delete-place-button.tsx`
- `apps/web/src/features/delete-place/ui/use-delete-place.ts`
- `apps/web/src/features/delete-place/ui/delete-place-button.test.tsx`

Выход за зону: **нет**.

## Что осталось / риски

- Замечаний P0/P1 нет, работа готова к вливанию.
- P2-рекомендации (4 шт.) — косметические, можно адресовать в последующих задачах.
