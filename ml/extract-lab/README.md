# extract-lab (`extractlab`)

Лабораторный пакет и CLI-утилита для извлечения мест и событий Москвы из коротких видеороликов (Instagram Reels/p, TikTok, YouTube Shorts, VK Клипы, Telegram-посты) через мультимодальные модели в **OpenRouter** (`google/gemini-3.5-flash-lite`, `google/gemini-3.6-flash`, `google/gemini-3.8-flash`), прямой **Gemini API** (`google-genai`) или локальный режим `--fake`.

Реализует **Сценарий 1** («Ссылка / видеофайл + подпись → структурированный список кандидатов мест без галлюцинаций координат») с дедупликацией по каноническому ключу (`canonical_key` / `sha256`) в локальном SQLite-кэше.

---

## Установка

Требуется Python 3.13+ и пакетный менеджер [`uv`](https://docs.astral.sh/uv/):

```bash
cd ml/extract-lab
uv sync
```

---

## Переменные окружения

Скопируйте `.env.example` в `.env` (файл `.env` добавлен в `.gitignore` и не коммитится) или передайте переменные окружения при запуске:

| Переменная                  | По умолчанию                   | Описание                                                                         |
| --------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `EXTRACT_PROVIDER`          | `openrouter`                   | Провайдер извлечения: `openrouter`, `gemini` или `fake`                          |
| `EXTRACT_MODEL`             | `google/gemini-3.5-flash-lite` | Модель для извлечения (`google/gemini-3.5-flash-lite`, `3.6-flash`, `3.8-flash`) |
| `OPENROUTER_API_KEY`        | —                              | Ключ OpenRouter API (приоритетнее файла)                                         |
| `OPENROUTER_API_KEY_FILE`   | `~/.openrouter_key`            | Путь к файлу с ключом OpenRouter API (в репозиторий не попадает)                 |
| `HTTPS_PROXY` / `ALL_PROXY` | —                              | HTTP/SOCKS-прокси (`httpx[socks]`, например `socks5h://127.0.0.1:2080`)          |
| `GEMINI_API_KEY`            | —                              | Ключ прямого Google Gemini API (для `EXTRACT_PROVIDER=gemini`)                   |
| `GEMINI_MODEL`              | `gemini-2.5-flash`             | Имя модели при использовании провайдера `gemini`                                 |
| `EXTRACTLAB_CACHE_PATH`     | `.extractlab_cache.sqlite3`    | Путь к файлу SQLite-кэша                                                         |

---

## Как запустить на ПК через OpenRouter

Ключ OpenRouter хранится локально в `~/.openrouter_key` (не коммитится и не выводится в лог). Для обхода блокировки по российскому IP (`Access denied by security policy`) запросы направляются через локальный SOCKS5-прокси `socks5h://127.0.0.1:2080`:

```bash
OPENROUTER_API_KEY_FILE=~/.openrouter_key \
HTTPS_PROXY=socks5h://127.0.0.1:2080 \
uv run extractlab run \
  --file /home/renat-ubuntu/dev/gde-hype-input/dataset/videos/v6cyL8hKVYQ.mp4 \
  --caption "Центр Космонавтики и Авиации #shorts" \
  --url "https://www.youtube.com/shorts/v6cyL8hKVYQ"
```

Особенности провайдера `openrouter` (`src/extractlab/openrouter_client.py`):

- Отправляет `POST https://openrouter.ai/api/v1/chat/completions` с `messages[0].content = [{type: "text", text: …}, {type: "video_url", video_url: {url: "data:video/mp4;base64,…"}}]` и `usage: {include: true}`.
- **Структурированный ответ:** сначала запрашивает `response_format: {type: "json_schema", ...}` по строгой Pydantic-схеме `Extraction` (без координат `lat`/`lon`). Если модель отклоняет `json_schema`, автоматически повторяет запрос без `response_format`, извлекает JSON из текста (включая блоки ` ```json `) и валидирует через Pydantic с одним повтором при невалидном JSON.
- **Токены и стоимость:** берутся напрямую из `usage` и `usage.cost` ответа OpenRouter; локальная таблица `pricing.json` используется как запасной вариант.
- **Надёжность:** настраиваемые таймауты, 2 автоматических повтора при ответах `429` и `5xx`, понятные сообщения об ошибках прокси (`403 Access denied by security policy`) и авторизации (`401`).

---

## Как проверить без ключа и без сети (`--fake`)

Для локальной проверки пайплайна, схемы ответа, канонизации ссылок и SQLite-кэша без ключей и без сетевых вызовов используйте флаг `--fake` (или `EXTRACT_PROVIDER=fake`):

```bash
uv run extractlab run \
  --file clip.mp4 \
  --caption "Бар «Underdog», ул. Маросейка, 6-8с1, м. Китай-город" \
  --url "https://www.instagram.com/reel/DC1xYz_9-aB/?igsh=MzRlODBiNWFlZA==" \
  --fake
```

Повторный запуск с той же ссылкой (даже с другими `utm_*` или `igsh` параметрами) вернёт ответ из SQLite-кэша с `"cache_hit": true` и `"cost_usd": 0.0`, не вызывая клиент модели.

---

## Запуск через прямой провайдер Gemini (`EXTRACT_PROVIDER=gemini`)

```bash
EXTRACT_PROVIDER=gemini \
GEMINI_API_KEY="ваш-ключ" \
HTTPS_PROXY=socks5h://127.0.0.1:2080 \
uv run extractlab run \
  --file /path/to/clip.mp4 \
  --caption "Подборка любимых кофеен на Чистых прудах" \
  --url "https://www.instagram.com/reel/DC1xYz_9-aB/"
```

---

## Тесты и проверки качества

По умолчанию `uv run pytest` запускает только офлайн-тесты (без сети, с подменой HTTP через `httpx.MockTransport`):

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy src tests
```

Для запуска живого интеграционного теста с реальным запросом в OpenRouter (автоматически пропускается, если нет ключа):

```bash
HTTPS_PROXY=socks5h://127.0.0.1:2080 uv run pytest -m live
```
