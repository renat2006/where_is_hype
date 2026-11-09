# Где Хайп? — API (`apps/api`)

FastAPI-бэкенд «Где Хайп?», реализующий контракт веб-прототипа (`packages/core` и `apps/web/src/shared/api/mocks/handlers.ts`).

## Хранилище (временное решение MVP)

> **Важно:** В текущем MVP пользовательские данные (анонимные сессии, сохранённые места, отметки визитов, шорт-листы «На вечер», голоса друзей, репорты о ненайдённых местах, события воронки и кэш разбора ссылок) хранятся в локальном файле **SQLite** (`sqlite3`), путь к которому задаётся переменной окружения `DATABASE_PATH` (по умолчанию `./where_is_hype.db`). Это **временное хранилище MVP** до переезда на единую схему PostgreSQL/PostGIS (`[[K4-R2]]`).

Гео-каталог Москвы и нечёткий матчинг названий (`PlaceMatcher` из `ml/extract-lab/geo/matcher.py`) подключаются через `GEO_DATABASE_URL` (PostGIS на порту `54329`). Если `GEO_DATABASE_URL` не задан, используется встроенный каталог мест Москвы.

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `DATABASE_PATH` | `where_is_hype.db` | Путь к файлу временного хранилища SQLite для MVP |
| `EXTRACTION_MODE` | `fake` | Режим `ExtractionPipeline`: `fake` (детерминированный) или `http` |
| `EXTRACT_SERVICE_URL` | `http://127.0.0.1:8090` | URL сервиса извлечения мест (`POST {EXTRACT_SERVICE_URL}/extract`) в режиме `http` |
| `EXTRACT_SERVICE_TOKEN` | `""` | Токен для заголовка `Authorization: Bearer {EXTRACT_SERVICE_TOKEN}` |
| `GEO_DATABASE_URL` | не задан | DSN базы PostGIS (`postgresql://where_is_hype:local-only@127.0.0.1:54329/where_is_hype_geo`) |
| `API_CORS_ORIGINS` | `["http://localhost:5173", ...]` | Разрешённые источники CORS |

## Запуск

```bash
cd apps/api
EXTRACTION_MODE=fake DATABASE_PATH=./where_is_hype.db uv run uvicorn where_is_hype_api.main:app --host 127.0.0.1 --port 4701
```

## Проверки качества

```bash
cd apps/api
uv run ruff check .
uv run ruff format --check .
uv run mypy src tests
uv run pytest
```

## Эндпоинты

- `GET /health` — проверка состояния сервиса
- `GET /me`, `POST /me` — получение и создание анонимной сессии (cookie `session_id` или заголовок `X-Session-Id`)
- `GET /places` — список мест каталога
- `GET /places/search?q=...` — поиск со 2-го символа с приоритизацией внутри Садового кольца
- `POST /links/resolve` — канонизация ссылки, вызов `ExtractionPipeline` (`Fake` или `Http`), сопоставление с базой через `PlaceMatcher` и возврат `Candidate[]` (часы работы строго из базы, без выдумывания координат; статусы `not_found` и `chain_ambiguous` возвращаются в `matchStatus` / `status`, а категории вне базовой схемы — в `rawCategory` / `category`)
- `GET /me/places`, `POST /me/places`, `PATCH /me/places/:id`, `DELETE /me/places/:id` — управление сохранёнными местами пользователя
- `POST /me/places/:id/visits`, `PATCH /me/places/:id/visits` — отметка визита (радиус верификации 200 м, не более 1 визита в день по Москве) и оценка ожиданий
- `GET /me/shortlist`, `PUT /me/shortlist`, `POST /me/shortlist/share` — шорт-лист «На вечер» (до 5 мест, срок действия ссылки 7 дней)
- `GET /s/:token`, `POST /s/:token/votes` — публичная страница шорт-листа для друга и голосование (`upsertVote` по `voterId`)
- `POST /demo/seed` — предзаполнение 8 демо-мест
- `POST /reports` — отправка заявки «Не нашли место»
- `POST /events` — приём анонимных событий продуктовой воронки
