# REVIEW-P05 — отчёт

Статус: готово

## Прогресс (новые сверху, время ЧЧ:ММ)

- 13:15 — Написан вердикт и полный отчёт по замечаниям.
- 13:14 — Прогнаны `pnpm check` (lint, steiger, typecheck, тесты — 34/34 passed). Проверена зона файлов — всё в рамках.
- 13:13 — Прочитаны задача P05, отчёт P05, все исходники ветки, макеты Brand.dc.html, Stress.dc.html, дизайн README, CLAUDE.md, CONTRIBUTING.md, токены CSS.

## Сверка с задачей P05

### Выполненные пункты задачи

1. ✅ `shared/ui/sticker`: наклейка по типу (`coffee`, `cafe`, `rest`, `bar`) и состоянию (`default`, `selected`, `visited`, `unknown`, `evening`/`inEvening`). Размеры sm/md/lg/xl. Поворот ±4° детерминированно по id через FNV-1a хеш. Проп `tilt`, по умолчанию выключен. Кластер `StickerCluster` с моно-числом и cap 40+. `MyLocationDot`. `MetroStation` (origin, map, badge).
2. ✅ `shared/ui/decor`: `MarkerOval` (варианты 1–3), `Strike`, `ArrowHand`, `Tape` — SVG по макету, с `aria-hidden`.
3. ✅ `shared/ui/logo`: `LogoLockup` «Где Хайп» + наклейка «?», `LogoCompact` с `pill`, `LogoMark`.
4. ✅ `apps/web/public`: favicon.svg (тёмная вкладка через `prefers-color-scheme`), icon-mono.svg, icon-180.png (180×180), apple-touch-icon.png (180×180), icon-192.png (192×192), icon-512.png (512×512), icon-512-maskable.png (512×512).
5. ✅ Страница `/ui-kit` не затронута (зона P04). Скриншоты в `reports/P05-shots/`.
6. ✅ Тесты: 14 тестов в `sticker.test.tsx`, `decor.test.tsx`, `logo.test.tsx` — детерминированный поворот, aria-label, состояния, инверсия для бара, PNG-размеры иконок.

### Зона файлов

Все изменения строго в зоне: `apps/web/src/shared/ui/{sticker,decor,logo}` и `apps/web/public/**`. Чужие файлы не затронуты.

## Проверки (команда → результат)

- `pnpm check` → ОК (format:check, lint, steiger, typecheck, test — 9 тестовых файлов, 34 теста, 0 ошибок)
- `git diff --name-only github-hype/feat/prototype...HEAD` → 18 файлов кода + скриншоты и отчёт — всё в зоне
- Размеры PNG-иконок проверены (`file` + Python struct) — 180×180, 192×192, 512×512 — совпадают с задачей
- favicon.svg содержит `prefers-color-scheme: dark`, оба маркерных цвета `#FF4A1C` / `#FF6A3D`, поворот `-4deg`

## Решения и наблюдения

### Качество кода

- Код чистый, хорошо структурирован. Barrel exports через `index.ts` в каждом сегменте. Типы корректно расширяют `HTMLAttributes` / `SVGProps`.
- Множественные экспортные алиасы (`PlaceSticker`, `ClusterSticker`, `MapCluster`, `MyPoint`, `UserLocationDot`, `MetroPin`, `MetroBadge`) — удобно для потребителей, но создаёт многословность API.
- Хеш-функция `getStickerTilt` — корректная реализация FNV-1a, тест подтверждает детерминированность.
- `formatStickerAriaLabel` покрывает все комбинации.

### Доступность

- Все декоративные SVG имеют `aria-hidden="true"` и `focusable="false"` ✅
- Sticker имеет `role="img"` + `aria-label` (отключается через `aria-hidden`) ✅
- StickerCluster, MyLocationDot, MetroStation — `role="img"` + `aria-label` ✅
- Логотипы — `role="img"` + `aria-label` ✅
- Внутренние текстовые элементы скрыты через `aria-hidden` чтобы не дублировать ✅

### Соответствие макету Brand.dc.html

- Цвета стикеров: `#FFD23F` (coffee), `#9ADBC5` (cafe), `#C9B6FF` (rest), `#FF4A1C` (bar) — совпадают с макетом ✅
- SVG-пути marker-oval-1..3 — побуквенно совпадают с макетом ✅
- SVG strike — совпадает с макетом ✅
- Инверсия бара (обводка ink, флажок paper) — совпадает с макетом ✅
- Кластер: стопка 3 кружков, углы -8°/5°/-3°, cap 40+ на surface — совпадает с макетом ✅
- Моя точка: ink-точка + ореол marker/16 — совпадает ✅
- Метро origin (пилюля М + название), map (точка + М), badge (кружок М) — совпадают ✅
- Логотип lockup: «Где Хайп» + наклейка «?» с -4° — совпадает ✅

### Стиль помогает контенту

Эта задача не создаёт экраны, только UI-компоненты. Все элементы декора помечены `aria-hidden`. Наклейки по умолчанию без наклона (для списков). Ночная тема поддерживается через токены. Нарушений правил 1–6 не обнаружено.

## Замечания

### P2 — EveningFlag использует `var(--color-marker)` вместо `var(--color-st-bar)` для заливки флажка

**Файл**: [`sticker.tsx#L143`](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P05/apps/web/src/shared/ui/sticker/sticker.tsx#L143)

В `EveningFlag` для обычных (не bar) наклеек заливка флажка использует `var(--color-marker)`, который в ночной теме = `#FF6A3D` (более светлый оранжевый), тогда как стикерные цвета (`--color-st-bar` = `#FF4A1C`) не переопределяются в ночной теме. По макету Brand.dc.html флажок всегда `#FF4A1C` (маркер дня). На практике разница визуально минимальна, но для консистентности лучше использовать `var(--color-st-bar)` или `#FF4A1C` напрямую, чтобы флажок не менял оттенок в зависимости от темы.

### P2 — Hardcoded `#17140F` в stroke EveningFlag и shadow наклеек

**Файл**: [`sticker.tsx#L140`](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P05/apps/web/src/shared/ui/sticker/sticker.tsx#L140), [`sticker.tsx#L235`](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P05/apps/web/src/shared/ui/sticker/sticker.tsx#L235), [`sticker.tsx#L238`](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P05/apps/web/src/shared/ui/sticker/sticker.tsx#L238), [`sticker.tsx#L317`](file:///home/renat-ubuntu/dev/where_is_hype/.farm/worktrees/REVIEW-P05/apps/web/src/shared/ui/sticker/sticker.tsx#L317)

Обводки и тени наклеек используют литерал `#17140F` вместо `var(--color-st-ink)`. Это корректно, потому что `--color-st-ink` = `#17140F` и не переопределяется в ночной теме. Тем не менее, использование CSS-переменной `var(--color-st-ink)` было бы надёжнее при будущих изменениях токенов. Это не баг, а рекомендация к единообразию.

### P2 — Расхождение отчёта с кодом: STICKER_TILT_ANGLES

В отчёте автора указано `[-4, -3, -2, -1.5, 1.5, 2, 3, 4]` (8 значений), а в коде `[-4, -3, -2, 2, 3, 4]` (6 значений, без ±1.5°). Работающий код верен и в пределах ±4°, но отчёт вводит в заблуждение.

### P2 — Расхождение отчёта с кодом: `opacity: 0.72` для visited

В отчёте автора упоминается `opacity: 0.72` для visited-состояния, но в коде opacity не применяется — visited отличается только зачёркиванием `Strike`. По макету Brand.dc.html тоже нет opacity для visited. Код корректен, отчёт неточен.

### P2 — Расхождение отчёта с кодом: проп `decorative`

В отчёте автора описан проп `decorative={true}` для `aria-hidden`. В коде такого пропа нет — вместо этого используется стандартный `aria-hidden` через `HTMLAttributes`. Это даже лучше, но отчёт неточен.

### P2 — Множество экспортных алиасов

`PlaceSticker`, `ClusterSticker`, `MapCluster`, `MyPoint`, `UserLocationDot`, `MetroPin`, `MetroBadge` — семь алиасов для трёх компонентов. Потенциально запутает потребителей. Рекомендую оставить один основной экспорт и один алиас максимум.

## Вердикт

**Вердикт: принять**

Задача P05 выполнена полностью. Все компоненты реализованы по макету, тесты покрывают ключевые сценарии, доступность обеспечена, проверки проходят. Замечания P2 — косметические и не блокируют приёмку. Расхождения отчёта автора с кодом (STICKER_TILT_ANGLES, opacity, decorative) не являются ошибками в коде — код корректен.

## Изменённые файлы

Только отчёт `/home/renat-ubuntu/dev/where_is_hype/.farm/reports/REVIEW-P05.md`.

## Что осталось / риски

- Замечания P2 можно адресовать в последующих задачах (рефакторинг).
- Наклейки не переключают цвета между днём и ночью — это by design по макету.
