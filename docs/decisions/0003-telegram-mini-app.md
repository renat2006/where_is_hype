# 0003. Telegram Mini App: SDK, архитектура Dual-Head и отказ от `@telegram-apps/telegram-ui`

- Статус: Принято
- Дата: 2026-11-09
- Связанные документы: [ADR 0001](0001-stack.md), [ADR 0002](0002-frontend-architecture.md), `docs/design/README.md`

## Контекст

Веб-клиент «Где хайп» (`apps/web`) должен работать одновременно в двух режимах из одного артефакта сборки (**Dual-Head Single-Build SPA**):

1. **Полноценный Telegram Mini App (TMA)** внутри клиентов Telegram (iOS, Android, Desktop, Web): нативная шапка и системная кнопка «Назад» (`BackButton`), главная и вторичная нижние кнопки (`MainButton` / `SecondaryButton`), тактильная отдача (`HapticFeedback`), блокировка закрытия вертикальным свайпом на карте и шторке (`swipeBehavior.disableVertical`), отступы безопасных зон (`safeAreaInset` / `contentSafeAreaInset`) и полноэкранный режим (`requestFullscreen`), хранилище (`DeviceStorage` / `CloudStorage`), глубокие ссылки (`start_param` → `/s/:token`, `/place/:id`), отправка шорт-листа в чат (`shareMessage`, `shareURL`, `switchInlineQuery`) и добавление иконки на домашний экран (`addToHomeScreen`).
2. **Самостоятельное веб-приложение (PWA / HTTPS)** в обычном браузере без Telegram и без VPN: друг, получивший ссылку `/s/:token` в любом мессенджере или SMS, открывает её напрямую и голосует в один тап без авторизации в Telegram.

Дополнительно требовалось проверить актуальное состояние пакетов экосистемы Telegram Mini Apps в npm на ноябрь 2026 года (`@tma.js/sdk-react` vs `@telegram-apps/sdk-react`) и оценить целесообразность подключения библиотеки компонентов `@telegram-apps/telegram-ui` поверх дизайн-системы «Зин».

## Рассмотренные варианты

### 1. Выбор SDK для Telegram Mini Apps

Проверены метаданные реестра npm (`npm view <pkg> version time peerDependencies`):

| Пакет                      | Актуальная версия | Последний релиз | Зависимость ядра                            | Поддержка React 19 в `peerDependencies` | Статус репозитория                           |
| -------------------------- | ----------------- | --------------- | ------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| `@tma.js/sdk-react`        | `3.0.23`          | `2026-10-28`    | `@tma.js/sdk@^3.3.0` (`2026-07-04`)         | `^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0`     | Активный (`Telegram-Mini-Apps/tma.js`)       |
| `@telegram-apps/sdk-react` | `3.3.9`           | `2025-12-05`    | `@telegram-apps/sdk@^3.11.8` (`2025-10-08`) | `^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0`     | Заморожен после возврата в скоуп `@tma.js/*` |

В середине 2024 года мейнтейнеры временно переименовывали скоуп `@tma.js/*` в `@telegram-apps/*`, однако осенью 2025 года официальный монорепозиторий `Telegram-Mini-Apps/tma.js` вернул основную разработку и выпуск версий в скоуп `@tma.js/sdk` (`3.0.0` → `3.3.0`, ветка `4.0.0-rc.1`) и `@tma.js/sdk-react` (`3.0.23`). Пакет `@telegram-apps/sdk` не обновлялся с октября 2025 года.

### 2. Оценка `@telegram-apps/telegram-ui` против дизайн-системы «Зин»

Проверен пакет `@telegram-apps/telegram-ui@2.1.13` (последняя публикация `2025-12-05`):

- **Конфликт зависимостей:** `peerDependencies` жёстко требует `"react": "^18.2.0"` и `"react-dom": "^18.2.0"`, тогда как `apps/web` работает на React `19.3.1`.
- **Конфликт с визуальным языком «Зин»:** `@telegram-apps/telegram-ui` инжектирует глобальные стили `--tgui--*`, имитирующие системные контролы iOS Cupertino и Android Material (мягкие размытые тени, системные шрифты `SF Pro` / `Roboto`, полупрозрачные разделители и синие/системные акценты). Дизайн-система «Зин» (`docs/design/README.md`) прямо запрещает размытые тени, цвета вне палитры токенов (`#F4EFE6` бумага, `#17140F` чернила, `#FF4A1C` маркер) и шрифты вне тройки `Dela Gothic One` / `Onest` / `Martian Mono`.
- **Разделение ответственности:** в TMA «нативность» дают не CSS-клоны ячеек iOS внутри WebView, а **системное обрамление хоста Telegram** (нативные `BackButton`, `MainButton` / `SecondaryButton`, `HapticFeedback`, `SafeAreaInset`, `SwipeBehavior`), которым управляет SDK через bridge.

## Решение

1. **Использовать `@tma.js/sdk-react@^3.0.23` (и `@tma.js/sdk@3.3.0`)** как единственный SDK для работы с Telegram Mini Apps.
2. **Отказаться от `@telegram-apps/telegram-ui`:** внутри вьюпорта использовать исключительно токены и примитивы «Зин» (`apps/web/src/shared/ui`), а нативное поведение Telegram реализовывать через системные контролы хоста (`BackButton`, `MainButton`, `SecondaryButton`, `HapticFeedback`, `SwipeBehavior`, `Viewport`).
3. **Изолировать интеграцию в слое `apps/web/src/shared/telegram`:**
   - Автоматическое определение окружения через `isTMA()` и безопасный разбор `retrieveLaunchParams()` / `initData`.
   - Поддержка `mockTelegramEnv` (`enableTelegramMockEnv`) для отладки, юнит-тестов и превью по параметру `?tma=1`, при этом обычный запуск по HTTPS-ссылке вне Telegram остаётся чистым веб-режимом (`isTma: false`) без ошибок инициализации.
   - Синхронизация темы `themeParams` с CSS-переменными `--tg-theme-*` поверх токенов «Зин» (`day` / `night`) и окраска нативных хромов Telegram (`miniApp.setHeaderColor`, `setBgColor`, `setBottomBarColor`) в цвет бумаги (`#F4EFE6`) или ночи (`#16130F`).
   - Привязка `viewport.safeAreaInsets()` и `viewport.contentSafeAreaInsets()` к CSS-переменным `--tg-safe-area-inset-*` и `--tg-content-safe-area-inset-*` и опциональная кнопка полноэкранного режима (`requestFullscreen` / `exitFullscreen`) на карте.
   - Унифицированное хранилище `telegramStorage` (`DeviceStorage` → `CloudStorage` → `localStorage`) для сессии и черновика добавления места.
   - Маршрутизация `start_param` при холодном старте: `s_<token>` / `shortlist_<token>` → `/s/:token`, `place_<id>` / `p_<id>` → `/place/:id`.

## Матрица возможностей и версий Telegram Mini Apps (Bot API)

Все вызовы в `shared/telegram` выполняются через проверки доступности (`isAvailable()` / `ifAvailable()`) с фолбэком для ранних версий клиентов и обычного браузера:

| Возможность                         | Компонент / метод SDK                           | Мин. версия Bot API   | Поведение в TMA                                                                                        | Поведение в браузере / старом клиенте                                  |
| ----------------------------------- | ----------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Запуск и `initData` / `start_param` | `retrieveLaunchParams`, `initData.restore`      | `6.0`                 | Чтение `tgWebAppData`, `start_param`, профиля пользователя                                             | Работа по обычным URL (`/s/:token`, `/place/:id`), гостевая сессия     |
| Разворот вьюпорта и тема            | `viewport.expand`, `themeParams.mount`          | `6.0`                 | Разворот шторки, CSS-переменные `--tg-theme-*`, синхронизация `day`/`night`                            | Переключатель темы «Авто / День / Ночь» по солнцу в Москве             |
| Системная кнопка «Назад»            | `backButton.mount`, `backButton.show`           | `6.1`                 | Нативная стрелка в шапке Telegram (внутриэкранная стрелка скрыта)                                      | Кнопка «Назад» внутри шапки экрана                                     |
| Нижние кнопки действия              | `mainButton`, `secondaryButton`                 | `6.0` / `7.10`        | Нативный `MainButton` («Добавить место», «Отправить другу», «Маршрут») и `SecondaryButton`             | Кнопки дизайн-системы «Зин» в интерфейсе                               |
| Тактильная отдача                   | `hapticFeedback.*`                              | `6.1`                 | Вибрация при сохранении места, голосовании, отметке визита и ошибках                                   | Безопасный no-op                                                       |
| Внешние ссылки (Яндекс.Карты)       | `openLink`                                      | `6.0`                 | Открытие во внешнем системном браузере / приложении карт                                               | `window.open(..., '_blank', 'noopener,noreferrer')`                    |
| Отправка ссылки / inline-шаринг     | `shareURL`, `switchInlineQuery`, `shareMessage` | `6.0` / `6.7` / `8.0` | Нативный диалог выбора чата Telegram или `shareMessage` (`prepared_message_id`) + обычная HTTPS-ссылка | Web Share API (`navigator.share`) или копирование HTTPS-ссылки в буфер |
| Облачное хранилище                  | `cloudStorage.getItem` / `setItem`              | `6.9`                 | Синхронизация сессии и черновика ссылки в облаке Telegram                                              | `window.localStorage`                                                  |
| Блокировка закрытия свайпом         | `swipeBehavior.disableVertical`                 | `7.7`                 | Запрет случайного закрытия TMA при перетаскивании карты и шторки                                       | Не требуется (нет внешней шторки мессенджера)                          |
| Полноэкранный режим и Safe Area     | `viewport.requestFullscreen`, `safeAreaInsets`  | `8.0`                 | Учёт вырезов экрана (`--tg-safe-area-inset-*`) и кнопка полного экрана на карте                        | Стандартные `env(safe-area-inset-*)` (`0px` на десктопе)               |
| Иконка на домашний экран            | `addToHomeScreen`, `checkHomeScreenStatus`      | `8.0`                 | Добавление ярлыка мини-приложения на рабочий стол iOS/Android из настроек                              | Установка через стандартный PWA манифест                               |
| Локальное хранилище устройства      | `deviceStorage.getItem` / `setItem`             | `9.0`                 | Персистентное хранилище на устройстве с фолбэком в `CloudStorage`                                      | `window.localStorage`                                                  |

## Последствия

- Один билд `apps/web` одинаково чисто работает и внутри Telegram, и по прямой HTTPS-ссылке у друга без Telegram и без VPN.
- Слой `shared/telegram` не протекает в доменную логику: все страницы и фичи обращаются к типизированным хукам и утилитам с гарантированным фолбэком.
- Сохраняется 100% соответствие дизайн-системе «Зин» без визуального конфликта с системными стилями `@telegram-apps/telegram-ui`.
