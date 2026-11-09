# extract-lab (`extractlab`)

Лабораторный пакет и CLI-утилита для сквозного извлечения мест и событий Москвы из коротких видеороликов (Instagram Reels/p, TikTok, YouTube Shorts, VK Клипы, Telegram-посты) через мультимодальные модели в **OpenRouter** (`google/gemini-3.5-flash-lite`, `google/gemini-3.6-flash`, `google/gemini-3.8-flash`), прямой **Gemini API** (`google-genai`) или локальный режим `--fake`, с последующим сопоставлением мест по локальному геосправочнику Москвы в **PostGIS + pg_trgm** (`geo/matcher.py`).

Реализует **Сценарий 1** («Ссылка / видеофайл + подпись → кэш → извлечение без галлюцинаций координат → геоматчинг с PostGIS → итоговый статус разрешения и оценка качества на размеченном наборе»).

---

## Установка

Требуется Python 3.13+ и пакетный менеджер [`uv`](https://docs.astral.sh/uv/):

```bash
cd ml/extract-lab
uv sync
```

Для работы геоматчинга против реальной базы PostGIS поднимите локальный контейнер и импортируйте срез OSM Москвы (один раз):

```bash
cd ml/extract-lab/geo
docker compose up -d
uv sync
uv run python import_osm.py
cd ..
```

Если PostGIS недоступен, в режиме `--fake` пайплайн и `eval.py` автоматически переключаются на встроенный офлайн-эталон `InMemoryPlaceMatcher`, чтобы прогон и тесты работали без внешних сервисов.

---

## Переменные окружения

Скопируйте `.env.example` в `.env` (файл `.env` добавлен в `.gitignore` и не коммитится) или передайте переменные окружения при запуске:

| Переменная                  | По умолчанию                                                       | Описание                                                                         |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `EXTRACT_PROVIDER`          | `openrouter`                                                       | Провайдер извлечения: `openrouter`, `gemini` или `fake`                          |
| `EXTRACT_MODEL`             | `google/gemini-3.5-flash-lite`                                     | Модель для извлечения (`google/gemini-3.5-flash-lite`, `3.6-flash`, `3.8-flash`) |
| `OPENROUTER_API_KEY`        | —                                                                  | Ключ OpenRouter API (приоритетнее файла)                                         |
| `OPENROUTER_API_KEY_FILE`   | `~/.openrouter_key`                                                | Путь к файлу с ключом OpenRouter API (в репозиторий не попадает)                 |
| `HTTPS_PROXY` / `ALL_PROXY` | —                                                                  | HTTP/SOCKS-прокси (`httpx[socks]`, например `socks5h://127.0.0.1:2080`)          |
| `GEMINI_API_KEY`            | —                                                                  | Ключ прямого Google Gemini API (для `EXTRACT_PROVIDER=gemini`)                   |
| `GEMINI_MODEL`              | `gemini-2.5-flash`                                                 | Имя модели при использовании провайдера `gemini`                                 |
| `EXTRACTLAB_CACHE_PATH`     | `.extractlab_cache.sqlite3`                                        | Путь к файлу SQLite-кэша                                                         |
| `GEO_DATABASE_URL`          | `postgresql://postgres:postgres@127.0.0.1:54329/where_is_hype_geo` | DSN локальной базы PostGIS со справочником мест и станций метро Москвы           |
| `VIDEOS_DIR`                | `data/videos`                                                      | Базовая папка с видеофайлами для относительных `video_path` в датасете           |

---

## 1. Сквозной пайплайн (`pipeline.py`)

Скрипт `pipeline.py` (или подкоманда `uv run extractlab pipeline`) связывает все этапы обработки одного ролика:

1. **Канонизация и SQLite-кэш (`cache_ms`):** вычисление `canonical_key` по URL (`ig:reel:<code>`, `yt:video:<id>`, `tt:video:<id>` и т.д.) или `file:sha256:<hex>` и проверка локального кэша.
2. **Мультимодальное извлечение (`extraction_ms`):** отправка видео и подписи в OpenRouter / Gemini (или эвристический разбор в режиме `--fake`) со строгой схемой `Extraction` без координат.
3. **Матчинг каждого места с PostGIS (`matching_ms`):** сопоставление каждого извлечённого кандидата через `PlaceMatcher` (`pg_trgm` + фильтр улицы/дома + геофильтр `ST_DWithin` 1500 м от станции метро).
4. **Статус разрешения (`resolution_status`) и `needs_user_choice`:**
   - `exact` — найден ровно один филиал или достоверный адрес (`needs_user_choice: false`).
   - `chain_ambiguous` — сетевое заведение без уточнения конкретного филиала (`needs_user_choice: true`, возвращается список филиалов).
   - `ambiguous` — несколько близких по названию заведений (`needs_user_choice: true`).
   - `not_found` — место не найдено в базе OSM Москвы (`needs_user_choice: false`; ветка внешнего веб-поиска оставлена заглушкой с `TODO`).

Запуск в режиме `--fake`:

```bash
uv run python pipeline.py \
  --caption "Бар «Underdog», ул. Маросейка, 6-8с1, м. Китай-город" \
  --url "https://www.instagram.com/reel/DC1xYz_9-aB/" \
  --fake
```

Запуск на реальном видео через OpenRouter:

```bash
OPENROUTER_API_KEY_FILE=~/.openrouter_key \
HTTPS_PROXY=socks5h://127.0.0.1:2080 \
uv run python pipeline.py \
  --file /home/renat-ubuntu/dev/gde-hype-input/dataset/videos/v6cyL8hKVYQ.mp4 \
  --caption "Центр Космонавтики и Авиации #shorts" \
  --url "https://www.youtube.com/shorts/v6cyL8hKVYQ"
```

---

## 2. Формат датасета (`data/dataset.example.jsonl`)

Каждая строка JSONL-файла описывает один тестовый случай:

```json
{
  "id": "ex-01",
  "source_url": "https://www.instagram.com/reel/Ex01Underdog/",
  "video_path": "ex-01-underdog.mp4",
  "caption": "Обзор: бар «Underdog», ул. Маросейка, 6-8с1, м. Китай-город",
  "case_type": "address_in_caption",
  "gold": [
    {
      "name": "Underdog",
      "address": "ул. Маросейка, 6-8с1",
      "is_chain": false,
      "branch_specified": true
    }
  ],
  "notes": "Фиктивный пример: точный адрес и станция метро указаны прямо в подписи."
}
```

Поддерживаемые значения `case_type`:

- `address_in_caption` — название и адрес указаны в подписи;
- `on_screen_text_only` — место указано только текстом/титрами на экране;
- `speech_only` — место названо только голосом в аудиодорожке;
- `multi_place` — подборка из нескольких мест в одном ролике;
- `chain_no_address` — сетевое заведение без уточнения конкретного филиала;
- `no_place` — ролик не про конкретное заведение (ожидается отказ `is_place_video=false`);
- `private_or_unavailable` — приватный или удалённый ролик.

Реальные видеофайлы в репозиторий не коммитятся: относительные пути `video_path` разрешаются относительно переменной окружения `VIDEOS_DIR` (или флага `--videos-dir`).

---

## 3. Прогон eval-харнесса (`eval.py`) и генерация отчёта (`report.py`)

`eval.py` прогоняет датасет через сквозной пайплайн, считает метрики качества в целом и в разрезе `case_type`:

- **Place Recall / Precision** по нечёткому совпадению названий (`--fuzzy-threshold`, по умолчанию `0.65`);
- **Доля верных адресов или метро** (`address_or_metro_accuracy`);
- **Доля верных `resolution_status`** (`resolution_status_accuracy`);
- **Доля корректных отказов для `no_place`** (`no_place_rejection_rate`);
- **Латентность `p50` / `p95`** (мс) и **стоимость** на ролик и в сумме (`$`).

Каждый прогон сохраняет сырой построчный вывод в `runs/<timestamp>.jsonl` и автоматически генерирует Markdown-отчёт `reports/eval-<timestamp>.md` (через `report.py`).

### Быстрая проверка с нуля в режиме `--fake`

```bash
cd ml/extract-lab
uv run python eval.py --dataset data/dataset.example.jsonl --fake --run-id example
```

Команда создаст `runs/example.jsonl` и готовый отчёт `reports/eval-example.md` с таблицей метрик по `case_type`, списком провалов, примерами и автоматическим разделом «Что не проверено» (отмечает типы случаев, где в наборе `< 5` роликов, а также пропуски по `private_or_unavailable` или сетевой поиск вне OSM).

Перегенерация Markdown-отчёта из существующего файла прогона:

```bash
uv run python report.py --run-file runs/example.jsonl --output reports/eval-example.md
```

### Прогон на реальном датасете через OpenRouter

```bash
VIDEOS_DIR=/home/renat-ubuntu/dev/gde-hype-input/dataset/videos \
OPENROUTER_API_KEY_FILE=~/.openrouter_key \
HTTPS_PROXY=socks5h://127.0.0.1:2080 \
uv run python eval.py \
  --dataset /path/to/dataset.jsonl \
  --provider openrouter \
  --model google/gemini-3.5-flash-lite
```

---

## 4. Тесты и проверки качества

По умолчанию `uv run pytest` запускает офлайн-тесты (без сети, с подменой HTTP через `httpx.MockTransport` и проверкой сквозного пайплайна, `eval.py` и `report.py`):

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy src tests pipeline.py eval.py report.py
```

Для запуска живого интеграционного теста с реальным запросом в OpenRouter (автоматически пропускается, если нет ключа):

```bash
HTTPS_PROXY=socks5h://127.0.0.1:2080 uv run pytest -m live
```
