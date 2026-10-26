# «Где Хайп?»

Приложение, которое собирает места, сохранённые из Reels и постов, на одной карте, помогает выбрать с другом, куда пойти, и подтверждает визит. Старт: Москва, внутри Садового кольца.

Рамки и истории MVP: [docs/product/mvp-scope.md](docs/product/mvp-scope.md).

## Стек

| Часть           | Технологии                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`      | React 19, Vite 8, TypeScript (strict), React Router, TanStack Query, Tailwind CSS 4, MSW, Vitest, Testing Library. Архитектура [Feature-Sliced Design](https://feature-sliced.design/ru/) |
| `packages/core` | Общие доменные схемы и типы на Zod, переиспользуются клиентами на всех платформах                                                                                                         |
| `apps/api`      | Python 3.13, FastAPI, Pydantic Settings, uv, Ruff, mypy (strict), pytest                                                                                                                  |
| Инфраструктура  | pnpm workspaces, Docker Compose (PostGIS, API), GitHub Actions, Dependabot, lefthook                                                                                                      |

Android/iOS и десктоп собираются из того же веб-клиента через Capacitor и Tauri 2, когда до них дойдём. Почему так: [ADR 0001](docs/decisions/0001-stack.md).

## Быстрый старт

Нужны Node.js 24 (`.nvmrc`), pnpm 10 (`corepack enable`), [uv](https://docs.astral.sh/uv/) и Docker.

```sh
pnpm install          # зависимости и git-хуки
cp apps/web/.env.example apps/web/.env
pnpm dev              # веб на http://localhost:5173, с моками API
```

API и база:

```sh
cd apps/api
uv sync
uv run uvicorn where_is_hype_api.main:app --reload   # http://localhost:8000/docs
docker compose up db                                 # PostGIS, из корня репо
```

## Команды

| Команда                                               | Что делает                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm check`                                          | Всё, что CI проверяет для TypeScript: формат, ESLint, Steiger (FSD), типы, тесты |
| `pnpm format`                                         | Prettier по всему репо                                                           |
| `pnpm --filter @where-is-hype/web build`              | Сборка веба в `apps/web/dist`                                                    |
| `uv run ruff check . && uv run ruff format --check .` | Линт и формат API (в `apps/api`)                                                 |
| `uv run mypy src tests && uv run pytest`              | Типы и тесты API (в `apps/api`)                                                  |

## Структура

```
apps/
  web/        веб-клиент (FSD: app, pages, widgets, features, entities, shared)
  api/        FastAPI
packages/
  core/       доменные схемы и типы
docs/
  decisions/  ADR
```

## Как работаем

Правила веток, коммитов и ревью: [CONTRIBUTING.md](CONTRIBUTING.md).
