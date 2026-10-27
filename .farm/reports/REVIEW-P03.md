# REVIEW-P03 — отчёт

Статус: готово

## Прогресс (новые сверху, время ЧЧ:ММ)

- 13:19 — Финальный отчёт написан. Вердикт: принять с замечаниями P2.
- 13:17 — Проверены все линтеры, тесты, тайпчек, FSD lint, статическая сборка — всё проходит. Замечания собраны от трёх параллельных ревью-подагентов и личной проверки.
- 13:16 — Прочитаны все 33 изменённых файла. Запущен `pnpm check`.
- 13:15 — Начал ревью. Изучена задача P03, отчёт автора, git log/diff.

## Решения и наблюдения

### Зона файлов

Все изменённые файлы в рамках зоны: `apps/web/src/shared/api/**` и `apps/web/src/entities/*/{api,model}` + их `index.ts`. Отчёт автора `.farm/reports/P03.md` — тоже в рамках. Выхода за зону нет.

### Что сделано по задаче

| #    | Пункт задачи                                                                                                               | Сделано? | Комментарий                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| 1    | 40 мест, 4 типа, координаты внутри Садового, 5 без часов, 3 без чека                                                       | ✅       | Проверено: 10+10+10+10=40, `hours: null` × 5, `avgCheck: null` × 3, все в кольце                         |
| 2    | MSW-обработчики (POST /me, GET /places/search, POST /links/resolve, CRUD /me/places, визиты, шорт-лист, /reports, /events) | ✅       | Все эндпоинты реализованы, задержки 300-800 мс (кроме POST /events — см. P2-6), состояние в localStorage |
| 3    | `apiPost`, `apiPut`, `apiPatch`, `apiDelete` в `shared/api`                                                                | ✅       | Реализованы с overloads, Zod-валидацией, `ApiError`                                                      |
| 4    | Сегменты api/model сущностей: place, saved-place, shortlist, session                                                       | ✅       | queryOptions, мутации, модельные хелперы, индексы                                                        |
| Демо | Две заготовленные ссылки, 409 при повторе, фильтр 19:00/1500₽ → 3-5 мест, POST /demo/seed                                  | ✅       | Тест подтверждает: 4 места из 8, с «Жук и Пчела» — 5 мест. Журавли (hours: null) в выборке               |

### Проверки

Все проверки автора подтверждены:

| Команда                                       | Результат                                                       |
| --------------------------------------------- | --------------------------------------------------------------- |
| `pnpm format:check`                           | ✅ PASS                                                         |
| `pnpm lint`                                   | ✅ PASS (0 ошибок, 0 предупреждений)                            |
| `pnpm lint:fsd` (steiger)                     | ✅ PASS — No problems found                                     |
| `pnpm typecheck`                              | ✅ PASS (core + web)                                            |
| `pnpm test`                                   | ✅ PASS (core: 8 файлов / 46 тестов; web: 12 файлов / 23 теста) |
| `VITE_API_MOCKS=true pnpm --filter web build` | ✅ PASS (dist/ с mockServiceWorker.js)                          |

### Неточности в отчёте автора (P03.md)

- Строка 37: ключ localStorage указан как `where_is_hype.msw.state.v1`, в коде `where-is-hype:mock-db:v1`. Не ошибка кода, но отчёт неточен.
- Строка 13: ID мест без часов в отчёте (`chashka-i-list`, `sirenevaya-veranda`, `dvorik-na-pyatnitskoy`, `tishina-v-pereulke`) не соответствуют коду (`tihiy-dvor`, `solyanka-bistro`, `bronny-ostrov`, `sekretny-shkaf`). Пятое место `zhuravli` — верно.
- Строка 14: ID мест без чека в отчёте (`filtr-i-zerno`, `sol-i-perets`, `ten-i-svet`) не соответствуют коду (`okoshko-specialty`, `letniy-sad-cafe`, `sekretny-shkaf`).
- Строка 41: упоминается `serviceWorker: { url: '/mockServiceWorker.js' }` — это API MSW v1/v2, а проект использует MSW v3 с `virtual:msw`. Код верный, описание нет.

## Вердикт

**Вердикт: принять**

Все пункты задачи выполнены. Все проверки (lint, typecheck, test, FSD, build) проходят. Замечания ниже — P2 (стиль кода, покрытие тестами, мелкие несоответствия); P0 и P1 нет.

## Замечания

### P2-1: `readMockState()` в production-коде `session-model.ts`

- **Файл:** `apps/web/src/entities/session/model/session-model.ts`, строки 2, 13
- `getStoredSession()` в fallback-ветке вызывает `readMockState().session`. Это втягивает mock-инфраструктуру в доменную модель сессии. В production-сборке (без моков) `readMockState()` вернёт пустое состояние — не баг, но нежелательная связанность. Лучше вернуть `null`.

### P2-2: Geo-утилиты (`isInsideGardenRing`, `GARDEN_RING_*`) живут в `handlers.ts`

- **Файл:** `apps/web/src/shared/api/mocks/handlers.ts`, строки 41-42, 158-160; `apps/web/src/entities/place/model/place-model.ts`, строка 25
- Сущность `place` импортирует geo-функции из файла mock-обработчиков. Они должны жить в `shared/lib` или в `packages/core` (где уже есть `distanceM`). Не баг, но архитектурный запах.

### P2-3: `POST /demo/seed` возвращает _все_ сохранённые места, а не только 8 демо

- **Файл:** `apps/web/src/shared/api/mocks/handlers.ts`, строка 902
- `return HttpResponse.json(db.savedPlaces)` — если у пользователя уже были места, ответ будет содержать больше 8. Тест проходит, потому что `resetMockState()` вызывается в `afterEach`. Для UI-потребителей это может быть неожиданно. Рекомендация: вернуть `toAdd` или весь список, но задокументировать поведение.

### P2-4: `POST /events` — единственный обработчик без `waitMockDelay()`

- **Файл:** `apps/web/src/shared/api/mocks/handlers.ts`, строки 930-941
- Все остальные обработчики вызывают `waitMockDelay()`, этот — нет. Вероятно, по замыслу (fire-and-forget), но нарушает консистентность с требованием задачи «задержки 300-800 мс».

### P2-5: `DELETE /me/places/:id` не чистит `votes[].placeIds` в shortlist

- **Файл:** `apps/web/src/shared/api/mocks/handlers.ts`, строки 699-706
- При удалении места из shortlist фильтруются `places`, но не `votes[].placeIds`. Голоса могут ссылаться на удалённое место. `PUT /me/shortlist` чистит голоса, но прямой `DELETE` — нет.

### P2-6: Дублирующиеся query-определения

- `shortlist-queries.ts`: `mine()` и `current()` идентичны (строки 48-57); `byToken()` и `shared()` идентичны (строки 58-69).
- `session-queries.ts`: `current()` и `me()` идентичны (строки 24-33).
- Не ошибка, но раздувает API. Лучше сделать одно определение и алиас.

### P2-7: Избыточные экспорт-алиасы

- `resolveLink`/`resolvePlaceLink`, `reportPlace`/`reportMissingPlace`, `useDeleteSavedPlaceMutation`/`useDeletePlaceMutation`, и т.д. — в 4 файлах ~10 пар алиасов, все re-экспортируются через `index.ts`. Раздувает публичный API.

### P2-8: Тесты entity-слоя — всё CRUD в одном `it()` блоке

- `saved-place-queries.test.tsx`, `shortlist-queries.test.tsx`, `place-queries.test.tsx` — каждый файл содержит 1 тест, в котором последовательно проверяются все операции. Если первая ассерция упадёт, остальные не выполнятся. Лучше разбить на отдельные `it()`.

### P2-9: `barWeekendHours()` — воскресенье = будний день

- **Файл:** `apps/web/src/shared/api/mocks/fixtures/places.ts`, строка 31
- `sun: weekday` — воскресенье получает будние часы. Может быть намеренно, но не очевидно. Не влияет на демо-фильтр (дата теста — вторник).

### P2-10: Одинаковый адрес у двух мест

- **Файл:** `apps/web/src/shared/api/mocks/fixtures/places.ts`, строки 52 и 377
- `pokrovka-coffee` и `zhuravli` оба имеют адрес «ул. Покровка, 17». Координаты разные, но одинаковый адрес нереалистичен.

### P2-11: Избыточный `dayIndex` в `getMoscowDateKey` / `getMoscowDateStamp`

- **Файлы:** `handlers.ts:350`, `saved-place-model.ts:44`
- День недели полностью определяется датой и добавлен в ключ без нужды. Работает корректно, но усложняет формат.

## Что осталось / риски

- UI не затронут — скриншоты не требуются.
- Все замечания P2 — не блокируют. Могут быть исправлены в следующих итерациях.
- Отчёт автора содержит несколько неточных ID мест (см. выше) — не влияет на код.
