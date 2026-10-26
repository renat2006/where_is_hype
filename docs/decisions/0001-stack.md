# 0001. Стек MVP

- Статус: Принято
- Дата: 2026-10-26
- Обсуждение: [документ со сравнением вариантов](https://claude.ai/artifact/3YKSRNdmXW6c2UJLAZ6A5k)

## Контекст

Нужен MVP сценария «Мои места». К КТ-3 он должен открываться по ссылке у эксперта без установки (мок-данные допустимы), а дальше развиваться в зрелый продукт без переписывания и быстро переноситься в Android и на ПК, оставаясь сайтом и, при желании, мини-приложением мессенджера.

Команда маленькая: разработка на TypeScript и Python, ML на Python. Есть VPS с Docker и Caddy. Instagram и Telegram в РФ заблокированы (Telegram с апреля 2026), поэтому шаринг другу идёт обычной ссылкой с превью в любой мессенджер, а мини-приложение (MAX или Telegram) остаётся опцией на потом.

## Рассмотренные варианты

- A. Веб-клиент React + Vite + TypeScript: сайт и мини-приложение одним билдом, Android/iOS через Capacitor, ПК через установку PWA или Tauri 2. Бэкенд FastAPI + Postgres/PostGIS.
- B. Next.js фуллстек на TypeScript + Postgres.
- C. Expo (React Native) + Supabase.
- D. Flutter.

## Решение

Вариант A.

- Монорепо на pnpm workspaces: `apps/web`, `apps/api`, `packages/core`.
- `apps/web`: React 19, Vite 8, TypeScript strict, React Router, TanStack Query, Tailwind CSS 4, MSW для моков, Vitest + Testing Library. Архитектура FSD, см. [ADR 0002](0002-frontend-architecture.md).
- `packages/core`: доменные схемы и типы на Zod без зависимостей от React и браузера, чтобы их переиспользовал любой будущий клиент, включая Expo.
- `apps/api`: Python 3.13, FastAPI, Pydantic Settings, uv; Ruff, mypy strict, pytest. Postgres с PostGIS для геозапросов.
- Качество: ESLint (typescript-eslint strict), Prettier, Steiger, Ruff, mypy; хуки lefthook; Conventional Commits через commitlint; CI в GitHub Actions; Dependabot; gitleaks.

## Последствия

- К КТ-3 выкладываем `apps/web` статикой с `VITE_API_MOCKS=true`; потом моки выключаются, и тот же код ходит в настоящий API.
- Два языка и два деплоя, зато ML и разбор ссылок сразу на Python.
- WebView на слабых Android медленнее натива. Если это станет проблемой, Expo-приложение возьмёт `packages/core` и API-слой и перепишет только экраны.
- Мини-приложение MAX требует бизнес-аккаунта (юрлицо РФ), это не задача MVP.
