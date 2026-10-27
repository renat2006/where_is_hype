# REVIEW-P15 — отчёт

Статус: готово

## Вердикт

Вердикт: принять

---

## Прогресс (новые сверху, время ЧЧ:ММ)

- 15:52 Завершён всесторонний аудит ветки `agents/P15`: статический анализ, FSD-архитектура, юнит- и интеграционные тесты, дизайн-система «Зин», PWA-манифест, Service Worker и скриншоты 360 px (день/ночь). Критических замечаний P0/P1 не обнаружено. Сформирован вердикт: **принять**.
- 15:50 Проверены PWA-артефакты: сборка `dist/manifest.webmanifest`, генерация `dist/sw.js` (41 precache-запись), Workbox navigationFallback `/index.html` с denylist `/^\/api\//`.
- 15:49 Проверены визуальные скриншоты экрана 16 («Офлайн · из кэша») и экрана «Медленная сеть» в день/ночь на ширине 360 px. Все правила дизайн-системы «Зин» соблюдены.
- 15:48 Запущены `pnpm check` (`format:check`, `lint`, `lint:fsd`, `typecheck`, `test`) и `pnpm build` — все проверки успешно пройдены.
- 15:48 Начало независимого код-ревью задачи P15.

---

## Решения и наблюдения

1. **Соответствие задаче P15 и макетам**:
   - `vite-plugin-pwa`: манифест с именем `«Где Хайп?»`, иконками из `public` (180, 192, 512, 512-maskable, mono), цветами темы `#F4EFE6` (день) / `#16130F` (ночь), Service Worker для оболочки приложения с кэшированием ассетов и навигационным fallback на `index.html`.
   - В рантайме регистрация боевого Service Worker (`/sw.js`) безопасно отключается при `VITE_API_MOCKS=true` или в dev-режиме, предотвращая конфликт с Service Worker от MSW (`mockServiceWorker.js`).
   - Синхронизация `<meta name="theme-color">` поддержана в `apps/web/src/app/pwa/register-pwa.ts` через `MutationObserver` атрибута `data-theme`.
   - Экран 16 «Офлайн · из кэша» (`OfflinePlacesView`) точно повторяет `docs/design/zin/ScreensB.dc.html`:
     - Плашка с пунктирным контуром и иконкой `WifiOff`: `«Нет сети. Показываем сохранённое»`.
     - Заголовок «Мои места» и моноширинная метка `обновлено в HH:MM` (расчёт в часовом поясе Москвы через `getMoscowDayAndMinutes`).
     - Список мест отсортирован по расстоянию от последней точки пользователя (`origin`), отображает статус часов (включая пунктирный бейдж «Часы не уточнены»).
     - Пояснительный блок в пунктирной рамке: _«Карта, добавление места и отправка друзьям вернутся, когда появится сеть. Расстояния — по последней точке.»_.
     - Неактивная кнопка действия `Добавить место · нужна сеть` с плоским стилем без тени.
   - Макет «Медленная сеть» (`SlowNetworkView`) из `docs/design/zin/Stress.dc.html`:
     - Скелетон карты (`260px`) и скелетоны строк мест с точными пропорциями ширины (70%/45% и 60%/40%).
     - Слот под подсказку зарезервирован с `min-h-[44px]`, поэтому появление баннера _«Сеть медленная. Карта догрузится»_ через 5 секунд (`SLOW_NETWORK_THRESHOLD_MS = 5_000`) не вызывает layout shift.

2. **Персист кэша TanStack Query**:
   - Реализована связка `setupQueryClientPersistence` и `hydrateSavedPlacesQueryClient` с валидацией через Zod (`persistedPlacesCacheSchema`).
   - Кэш сохраняется в `localStorage` (`where-is-hype:query-cache:v1`) с отметкой времени `updatedAt` и автоматической гидратацией QueryClient при старте.
   - Корректно обрабатываются битые JSON-данные в хранилище без падений приложения.

3. **Зона файлов и FSD**:
   - Основная работа выполнена строго в зоне задачи (`vite.config.ts`, `app/{query,pwa}`, `features/offline-status`, `package.json`, `pnpm-lock.yaml`).
   - Минимальное касание `apps/web/src/pages/my-places/ui/my-places-page.tsx` и `my-places-page.test.tsx` полностью обосновано: требовалось подключить `OfflinePlacesView` и `SlowNetworkView` к странице «Мои места».
   - FSD-архитектура соблюдена: Steiger (`pnpm lint:fsd`) подтверждает отсутствие нарушений слоёв и слайсов (`✔ No problems found!`).

4. **Дизайн-система «Зин» и доступность**:
   - Контент первым: первыми считываются название места, статус часов и расстояние.
   - Никаких недопустимых декоративных элементов (без рукописного шрифта Caveat на кнопках, без скотча, без наклонов строк).
   - Числа и время оформлены через `font-mono`.
   - Семантичные элементы: настоящие `<button>`, списки с `role="list"` и `role="listitem"`, плашки со статусом `role="status"`, скрытые заголовки `<h1>` для скринридеров, `aria-hidden` для скелетонов.
   - Проверены скриншоты в 360 px для дневной и ночной тем — контраст и читаемость отличные.

---

## Проверки (команда → результат)

- `pnpm format:check` → **PASS** (`All matched files use Prettier code style!`)
- `pnpm lint` (`eslint . --max-warnings=0`) → **PASS** (`0 errors, 0 warnings`)
- `pnpm lint:fsd` (`steiger ./src`) → **PASS** (`✔ No problems found!`)
- `pnpm typecheck` (`pnpm -r typecheck`) → **PASS** (все пакеты без ошибок)
- `pnpm test` (`pnpm -r test`) → **PASS**:
  - `packages/core`: 8 test files passed (46 tests)
  - `apps/web`: 69 test files passed (186 tests)
- `pnpm build` (`pnpm -r build`) → **PASS** (`PWA v2.0.0`, `mode generateSW`, precache 41 entries, сгенерированы `dist/manifest.webmanifest`, `dist/sw.js`, `dist/workbox-9c191d2f.js`)

---

## Изменённые файлы

Ревьюер не изменял файлы репозитория.
Файлы автора ветки `agents/P15`:

- `apps/web/package.json`
- `pnpm-lock.yaml`
- `apps/web/vite.config.ts`
- `apps/web/src/app/pwa/index.ts`
- `apps/web/src/app/pwa/pwa-config.ts`
- `apps/web/src/app/pwa/pwa.test.ts`
- `apps/web/src/app/pwa/register-pwa.ts`
- `apps/web/src/app/query/index.ts`
- `apps/web/src/app/query/query-client.ts`
- `apps/web/src/app/query/query-client.test.ts`
- `apps/web/src/features/offline-status/index.ts`
- `apps/web/src/features/offline-status/model/offline-status-model.ts`
- `apps/web/src/features/offline-status/model/offline-status-model.test.ts`
- `apps/web/src/features/offline-status/ui/offline-action-button.tsx`
- `apps/web/src/features/offline-status/ui/offline-places-view.tsx`
- `apps/web/src/features/offline-status/ui/offline-status.test.tsx`
- `apps/web/src/features/offline-status/ui/slow-network-view.tsx`
- `apps/web/src/pages/my-places/ui/my-places-page.tsx`
- `apps/web/src/pages/my-places/ui/my-places-page.test.tsx`

---

## Замечания (P0 / P1 / P2)

Критических замечаний P0 и P1 нет.

### Рекомендации и наблюдения (P2):

1. [apps/web/vite.config.ts#L9](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P15/apps/web/vite.config.ts#L9) — Импорт `./src/app/pwa/pwa-config` выполнен без расширения файла `.ts`. В Vite 8 / `configLoader: 'native'` это вызывает предупреждение `unsupported by configLoader: 'native'`. Рекомендуется добавить расширение: `from './src/app/pwa/pwa-config.ts'`.
2. [apps/web/src/app/query/query-client.ts#L17-L25](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P15/apps/web/src/app/query/query-client.ts#L17-L25) — В отчёте P15 автор упомянул настройку `networkMode: 'offlineFirst'`, однако в конфигурации `createAppQueryClient` этот параметр опущен (TanStack Query использует дефолтный `networkMode: 'online'`). Фактическая логика офлайна обеспечивается через `enabled: !isOffline` и ручную гидратацию кэша, что корректно работает, но для единообразия с документацией можно явно передать `networkMode: 'offlineFirst'`.
3. [apps/web/index.html](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P15/apps/web/index.html) — `vite-plugin-pwa` инжектит `<link rel="manifest">`, однако в исходном `index.html` отсутствуют теги `<link rel="icon" href="/favicon.svg">` и `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` (хотя сами файлы присутствуют в `public` и включены в кэш). Стоит добавить их в рамках отдельной общей доработки разметки head.

---

## Что осталось / риски

- Рисков для слияния ветки нет. Задача выполнена чисто, функционал покрыт тестами, прототип готов к работе.
