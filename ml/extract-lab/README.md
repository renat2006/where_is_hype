# extract-lab (`extractlab`)

Лабораторный пакет и CLI-утилита для извлечения мест и событий Москвы из коротких видеороликов (Instagram Reels/p, TikTok, YouTube Shorts, VK Клипы, Telegram-посты) через мультимодальную модель **Gemini** (`google-genai`).

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

Скопируйте `.env.example` в `.env` (файл `.env` добавлен в `.gitignore` и не коммитится) или экспортируйте переменные в оболочке:

| Переменная              | По умолчанию                | Описание                                                               |
| ----------------------- | --------------------------- | ---------------------------------------------------------------------- |
| `GEMINI_API_KEY`        | —                           | Ключ Google Gemini API (обязателен для реальных запросов без `--fake`) |
| `GEMINI_MODEL`          | `gemini-2.5-flash`          | Имя модели Gemini                                                      |
| `HTTPS_PROXY`           | —                           | HTTPS/SOCKS-прокси для доступа к API с российских IP                   |
| `EXTRACTLAB_CACHE_PATH` | `.extractlab_cache.sqlite3` | Путь к файлу SQLite-кэша                                               |

---

## Как проверить без ключа и без сети (`--fake`)

Для локальной проверки пайплайна, схемы ответа, канонизации ссылок и SQLite-кэша без `GEMINI_API_KEY` и без сетевых вызовов используйте флаг `--fake`:

```bash
uv run extractlab run \
  --file clip.mp4 \
  --caption "Бар «Underdog», ул. Маросейка, 6-8с1, м. Китай-город" \
  --url "https://www.instagram.com/reel/DC1xYz_9-aB/?igsh=MzRlODBiNWFlZA==" \
  --fake
```

Повторный запуск с той же ссылкой (даже с другими `utm_*` или `igsh` параметрами) вернёт ответ из SQLite-кэша с `"cache_hit": true` и `"cost_usd": 0.0`, не вызывая клиент модели.

---

## Запуск с реальным ключом Gemini

```bash
export GEMINI_API_KEY="ваш-ключ"
export GEMINI_MODEL="gemini-2.5-flash"
# Опционально:
# export HTTPS_PROXY="http://user:pass@proxy-host:port"

uv run extractlab run \
  --file /path/to/clip.mp4 \
  --caption "Подборка любимых кофеен на Чистых прудах" \
  --url "https://www.instagram.com/reel/DC1xYz_9-aB/"
```

Особенности клиента (`src/extractlab/gemini_client.py`):

- Видео до **20 МБ** передаётся байтами inline (`types.Blob`) вместе с подписью (`caption`) и системным промптом из `prompts/extract_places.md`.
- По умолчанию используется `media_resolution = MEDIA_RESOLUTION_LOW` для экономии входных видео-токенов.
- Для коротких роликов **≤ 18 секунд** (определяется автоматически по заголовку `mvhd` MP4 или через `--duration-sec`) выставляется `fps = 2.0` в `VideoMetadata`.
- Ответ строго валидируется по Pydantic-схеме `Extraction` (`response_schema`), которая **не содержит и не принимает координаты (`lat`/`lon`)**.
- Стоимость (`cost_usd`) рассчитывается по таблице `pricing.json` (значения-заглушки с датой и пометкой `проверить`).

---

## Тесты и проверки качества

Все тесты полностью автономны и не ходят в сеть:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy src tests
```
