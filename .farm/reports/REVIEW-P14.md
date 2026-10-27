# REVIEW-P14 — отчёт

Статус: готово

## Прогресс (новые сверху, время ЧЧ:ММ)

- 16:50 — Финализация отчёта и вынесение вердикта: работа выполнена в строгом соответствии с требованиями задачи P14, MVP-scope (US8) и дизайн-системы «Зин». Критических замечаний (P0/P1) нет. Вердикт: принять.
- 16:48 — Визуальный аудит скриншотов (360×780, день/ночь): проверены карточка места с кнопкой «Я здесь», модальное окно «Визит отмечен» (подтверждённый и без проверки с переключателем демо), заблокированное состояние при лимите 1 визит в день и окно «Сходили вчера?». Скриншоты скопированы в `REVIEW-P14-shots`.
- 16:47 — Прогон полного комплекса автоматических проверок: Prettier, ESLint (`--max-warnings=0`), Steiger FSD, TypeScript (`packages/core`, `apps/web`), Vitest (75 тест-файлов, 213 тестов в web; 8 тест-файлов, 46 тестов в core), производственная сборка `pnpm build`, а также проверки API (`apps/api`: Ruff, Mypy, Pytest). Все проверки пройдены с нулём ошибок.
- 16:45 — Детальный аудит диффа ветки `agents/P14` (`9c9ca0d` и `58805a3`), проверка соответствия критериям приёмки US8, макетам 14–15 в `ScreensB.dc.html`, правилам дизайн-системы «Зин» и A11y.
- 16:42 — Начало ревью: прочитана задача P14, отчёт автора P14, CLAUDE.md, docs/design/README.md. Получен diff.

## Решения и наблюдения

1. **Соответствие задаче и критериям приёмки US8 (`docs/product/mvp-scope.md`)**:
   - `features/mark-visit`:
     - Кнопка «Я здесь» подключена в карточке места (`apps/web/src/pages/place/ui/place-page.tsx`) в слот `resolvedVisitSlot` (слот P11).
     - Проверка геопозиции: функция `evaluateVisitLocation` сопоставляет координаты пользователя и места с радиусом `VISIT_VERIFICATION_RADIUS_M = 200`. В пределах 200 м визит помечается как подтверждённый (бейджик `подтверждён · рядом, до 200 м` со стилем `bg-status-open`), дальше 200 м или при отказе геолокации — `без проверки · ты дальше 200 м` с пунктирной рамкой `border-dashed border-ink`.
     - Демо-режим для эксперта: при `VITE_API_MOCKS=true` внизу окна размещён `btn-text`-переключатель «Демо: я рядом / я далеко» (по умолчанию «рядом»), позволяющий на лету переключать проверку геопозиции и статус визита.
     - Лимит визитов: проверяется функция `hasVisitedToday(effectiveSavedPlace, now)` по московскому календарному дню; при наличии визита кнопка «Я здесь» блокируется с подписью `VISIT_MARKED_TODAY_CAPTION` («Не больше одного визита в место за день»).
     - Экран «Визит отмечен» (экран 14 `ScreensB.dc.html`): зачёркнутая наклейка со счётчиком «был в X из Y», блок «Совпало с ожиданиями?» с чипами `Лучше` / `Как ждал` / `Хуже`, необязательное текстовое поле (до 280 символов) и кнопка «Готово».
     - Анимация зачёркивания: реализована через ключевые кадры `zin-motion-strike` и токен `--motion-strike` (400ms ease-in-out) для ассета `strike`, срабатывает один раз, без конфетти. При `prefers-reduced-motion: reduce` анимация отключается в CSS и в атрибутах контейнера.
     - Отображение посещённого места: статус `visited` сохраняется в данные `visits` модели `SavedPlace`, что автоматически обновляет отображение наклейки на карте (`places-map`) и бейдж «был здесь» в шторке (`places-sheet`) без прямого вмешательства в чужие виджеты.
     - Аналитика: корректно отправляются события `visit_marked` (`verified: boolean`, `status: 'verified' | 'not'`) и `expectation_answered` (`expectation: 'better' | 'as_expected' | 'worse'`).
   - `features/yesterday-check`:
     - Экран «Сходили вчера?» (экран 15 `ScreensB.dc.html`) проверяет `isShortlistFromPreviousDay`: показывается на следующий календарный день по Москве после создания шорт-листа при открытии приложения.
     - В демо текущего дня окно не показывается, не мешая презентации основного сценария (при этом предусмотрен параметр `?yesterdayCheck=1` для прямой проверки экрана в демо).
     - Позволяет отметить посещённые места кнопкой «Были тут», подтвердить кнопкой «Готово» (с тостом «Записали. Спасибо!»), либо отклонить кнопками «Не дошли» или «Не спрашивать про этот вечер». Факт закрытия персистится в `localStorage` (`where-is-hype:yesterday-check-dismissed`).

2. **Зона файлов и архитектура FSD**:
   - Автор строго остался в границах зоны: `apps/web/src/features/{mark-visit,yesterday-check}`, слот в `apps/web/src/pages/place/ui/place-page.tsx` и подключение модалки в `apps/web/src/app/router/app-layout.tsx`.
   - Слайсы полностью изолированы друг от друга, зависимости направлены исключительно «сверху вниз» (`app` → `pages` → `features` → `entities` → `shared` + `@where-is-hype/core`).
   - `steiger ./src` завершился с нулём ошибок (`✔ No problems found!`).

3. **Соблюдение дизайн-системы «Зин» («стиль помогает контенту»)**:
   - _Контент первым_: Название места, статус часов, расстояние и статус подтверждения визита читаются мгновенно.
   - _Один акцент на экран_: В окне «Визит отмечен» единственным акцентом является зачёркнутая наклейка со штрихом `strike`. В окне «Сходили вчера?» единственным декоративным элементом выступает фраза Caveat «ну как оно?», строго по макету 15. Лишний скотч, повороты текста и конфетти отсутствуют.
   - _Списки и формы без лишнего декора_: Чипы, поля ввода, строки списка и кнопки выполнены плоско, строго по токенам, без рукописного шрифта и случайных наклонов.
   - _Правило одной главной кнопки_:
     - В карточке места главной кнопкой `btn-primary` остаётся «Маршрут», кнопка «Я здесь» оформлена как `btn-secondary`.
     - В окне «Визит отмечен» единственная `btn-primary` — «Готово». Переключатель демо выполнен как `btn-text`.
     - В окне «Сходили вчера?» кнопка «Готово» является единственной `btn-primary` (появляется при выборе мест), «Не дошли» — `btn-secondary`, «Не спрашивать про этот вечер» — `btn-text`.
   - _Моноширинные цифры_: Все числовые значения (`200 м`, `X из Y`, количество мест) набраны шрифтом `font-mono`.
   - _Доступность (A11y)_: Используются семантические `<button>` и `<textarea>`, для окон заданы `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, кнопки-иконки имеют `aria-label="Закрыть"`, чипы имеют `aria-pressed`, для статуса визита используется `role="status"` и `aria-live="polite"`. Закрытие по `Escape` реализовано в окне визита.
   - _Адаптивность и темы_: Все экраны протестированы на ширине 360 px в дневной (`t-day`) и ночной (`t-night`) темах — вёрстка не ломается, текст не выпадает, контраст токенов соблюдён.

## Проверки (команда → результат)

- `pnpm format:check` → `All matched files use Prettier code style!` (PASS)
- `pnpm lint` → `eslint . --max-warnings=0` — 0 ошибок, 0 предупреждений (PASS)
- `pnpm lint:fsd` → `steiger ./src` — `✔ No problems found!` (PASS)
- `pnpm typecheck` → `tsc -p tsconfig.json` в `packages/core` и `apps/web` — 0 ошибок (PASS)
- `pnpm test` → Vitest: `packages/core` (8 файлов, 46 тестов), `apps/web` (75 файлов, 213 тестов) — все тесты пройдены (PASS)
- `pnpm build` → `tsc -p tsconfig.json && vite build` — сборка успешна (PASS)
- `cd apps/api && uv run ruff check . && uv run ruff format --check . && uv run mypy src tests && uv run pytest` → все проверки API пройдены (PASS)

## Изменённые файлы

(В рамках ревью код не менялся)

## Скриншоты (360×780, день и ночь)

- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P14-shots/place-mark-visit-button-day.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P14-shots/place-mark-visit-button-night.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P14-shots/visit-marked-verified-day.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P14-shots/visit-marked-verified-night.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P14-shots/visit-marked-unverified-day.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P14-shots/visit-marked-unverified-night.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P14-shots/place-visited-limit-day.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P14-shots/place-visited-limit-night.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P14-shots/yesterday-check-day.png`
- `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P14-shots/yesterday-check-night.png`

## Замечания

### P0 (Блокирующие)

Замечаний нет.

### P1 (Критические / дизайн-система / логика)

Замечаний нет.

### P2 (Рекомендации и полировка на будущее)

1. [`apps/web/src/features/yesterday-check/ui/yesterday-check-modal.tsx:167-282`](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P14/apps/web/src/features/yesterday-check/ui/yesterday-check-modal.tsx#L167-L282): в модальном окне «Сходили вчера?» отсутствует слушатель нажатия клавиши `Escape` (в отличие от `MarkVisitModal`, где обработчик добавлен через `useEffect`). Хотя окно содержит явные кнопки действий («Не дошли», «Не спрашивать про этот вечер»), закрытие по `Escape` является хорошей практикой доступности модальных диалогов.
2. [`apps/web/src/features/yesterday-check/ui/yesterday-check-modal.tsx:161`](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P14/apps/web/src/features/yesterday-check/ui/yesterday-check-modal.tsx#L161): при завершении выбора мест в окне «Сходили вчера?» вызывается `showToast({ message: 'Записали. Спасибо!' })`. На главной странице (`/`) компонент `<ToastViewport />` на данный момент не смонтирован (тосты монтируются постранично в `/place/:id`, `/evening`, `/add`), из-за чего сообщение попадает в стор, но не отображается пользователю на карте. Рекомендуется в последующих задачах вынести `<ToastViewport />` на уровень `AppLayout`.
3. [`apps/web/src/features/mark-visit/ui/mark-visit-button.tsx:33-39`](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P14/apps/web/src/features/mark-visit/ui/mark-visit-button.tsx#L33-L39): создание модуля fallback QueryClient (`fallbackQueryClient`) удобно для изолированных юнит-тестов без контекста провайдера, однако при потенциальном внедрении серверного рендеринга (SSR) может потребоваться строгая изоляция клиентских инстансов между запросами.

## Вердикт

Вердикт: принять

## Что осталось / риски

- Задач для доработки в рамках ветки `agents/P14` нет.
- Ветка готова к слиянию в `feat/prototype`.
