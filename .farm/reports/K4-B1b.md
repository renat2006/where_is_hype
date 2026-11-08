# K4-B1b — отчёт

Статус: готово

## Прогресс (новые сверху, время ЧЧ:ММ)

- 01:48 — Пройден корневой `pnpm check` (`format:check`, `lint`, `lint:fsd`, `typecheck`, `test` — 78 файлов, 224 теста) и все проверки в `ml/extract-lab` (`ruff check`, `ruff format --check`, `mypy src tests`, `pytest` — 50 офлайн-тестов + 1 live-тест). Изменения закоммичены в ветку `agents/K4-B1b`. Статус переведён в «готово».
- 01:46 — Выполнены проверки `ruff check .`, `ruff format --check .`, `mypy src tests`, офлайн-тесты `uv run pytest` (50 passed, 1 deselected) и живой тест `HTTPS_PROXY=socks5h://127.0.0.1:2080 uv run pytest -m live` (1 passed). Выполнен реальный прогон `extractlab run` на видеоролике из `/home/renat-ubuntu/dev/gde-hype-input/dataset/videos/v6cyL8hKVYQ.mp4`. Запущен корневой `pnpm check`.
- 01:40 — Реализован провайдер `openrouter` (`src/extractlab/openrouter_client.py`), фабрика провайдеров `create_extract_client` (`openrouter` по умолчанию, `gemini`, `fake`), поддержка `EXTRACT_PROVIDER`, `EXTRACT_MODEL`, `OPENROUTER_API_KEY` / `OPENROUTER_API_KEY_FILE`, SOCKS/HTTPS-прокси через `httpx[socks]`, извлечение цены из `usage.cost` (с `pricing.json` как запасным вариантом), структурированный вывод `response_format: json_schema` с автоматическим откатом на текстовый JSON (включая блоки ` ```json `) и повтором при невалидном JSON, 2 повтора на `429`/`5xx`, офлайн-тесты и `live`-тест, обновлён `README.md`.
- 01:26 — Инициализирован отчёт. Изучены правила репозитория (`CLAUDE.md`, `CONTRIBUTING.md`, `docs/product/mvp-scope.md`, ADR) и отчёт `K4-B1.md`. Влита ветка `agents/K4-B1` в рабочую копию `agents/K4-B1b`.

## Решения и наблюдения

- **Провайдер `openrouter` по умолчанию (`openrouter_client.py`, `cli.py`):**
  - `EXTRACT_PROVIDER` выбирает провайдера из `openrouter` (по умолчанию), `gemini` и `fake` (также поддержан флаг `--provider` и `--fake`).
  - `EXTRACT_MODEL` задаёт модель (по умолчанию `google/gemini-3.5-flash-lite`; поддерживаются также `google/gemini-3.6-flash`, `google/gemini-3.8-flash`).
  - Ключ читается из `OPENROUTER_API_KEY` или из файла `OPENROUTER_API_KEY_FILE` (по умолчанию `~/.openrouter_key`), без вывода секрета в лог или тексты ошибок.
  - Прокси читается из `HTTPS_PROXY` / `ALL_PROXY` и передаётся в `httpx.Client` (`httpx[socks]`, проверено с `socks5h://127.0.0.1:2080`).
- **Надёжность и обработка ошибок:**
  - Заданы таймауты (`timeout=60s`, `connect_timeout=15s`), до 2 повторов с экспоненциальной паузой при ответах `429` и `5xx` (включая вложенные коды ошибок OpenRouter), а также понятные ошибки при `403 Access denied by security policy` (с подсказкой проверить `HTTPS_PROXY` / `ALL_PROXY`) и `401`.
- **Структурированный ответ и валидация Pydantic:**
  - Первым отправляется запрос с `response_format: {type: "json_schema", json_schema: {name: "Extraction", strict: true, schema: ...}}`.
  - Если модель не принимает `json_schema` (возвращает `400`/`422`), клиент автоматически повторяет запрос без `response_format`, извлекает JSON из текста (в том числе из блоков ` ```json `) и валидирует его по схеме `Extraction` (строго без `lat`/`lon`) с одним повтором при невалидном JSON.
- **Учёт токенов и стоимости:**
  - Токены (`prompt_tokens`, `candidates_tokens`, `cached_tokens`, `thoughts_tokens`, `total_tokens`) и точная стоимость (`cost_usd`) берутся напрямую из `usage` и `usage.cost` ответа OpenRouter (`usage: {include: true}`). Локальная таблица `pricing.json` оставлена как запасной вариант на случай отсутствия `usage.cost`.

## Реальный запуск на видео из датасета

Команда:

```bash
OPENROUTER_API_KEY_FILE=~/.openrouter_key \
HTTPS_PROXY=socks5h://127.0.0.1:2080 \
uv run extractlab run \
  --file /home/renat-ubuntu/dev/gde-hype-input/dataset/videos/v6cyL8hKVYQ.mp4 \
  --caption "Центр Космонавтики и Авиации #shorts" \
  --url "https://www.youtube.com/shorts/v6cyL8hKVYQ" \
  --no-cache
```

Параметры ролика и метрики:

- Файл: `/home/renat-ubuntu/dev/gde-hype-input/dataset/videos/v6cyL8hKVYQ.mp4` (761 КБ, 11 с)
- Модель: `google/gemini-3.5-flash-lite`
- Время ответа (`latency_ms`): **`1524.06 мс` (`1.52 с`)**
- Входные токены (`prompt_tokens`): **`3538`**, выходные (`candidates_tokens`): **`170`**, всего (`total_tokens`): **`3708`**
- Стоимость (`usage.cost` / `cost_usd`): **`0.001486 USD`**

Вывод:

```json
{
  "items": [
    {
      "name": "Центр «Космонавтика и авиация»",
      "aliases": ["Центр Космонавтики и Авиации"],
      "category": "museum",
      "address_raw": null,
      "metro_hint": null,
      "landmark_hint": null,
      "city": "Москва",
      "evidence": "caption",
      "quote": "Центр Космонавтики и Авиации",
      "timecode_sec": 0.0,
      "confidence": 0.8
    }
  ],
  "video_has_multiple_places": false,
  "resolution_hint": "exact",
  "notes": "Упомянут Центр Космонавтики и Авиации (ВДНХ) в подписи к ролику.",
  "extraction": {
    "items": [
      {
        "name": "Центр «Космонавтика и авиация»",
        "aliases": ["Центр Космонавтики и Авиации"],
        "category": "museum",
        "address_raw": null,
        "metro_hint": null,
        "landmark_hint": null,
        "city": "Москва",
        "evidence": "caption",
        "quote": "Центр Космонавтики и Авиации",
        "timecode_sec": 0.0,
        "confidence": 0.8
      }
    ],
    "video_has_multiple_places": false,
    "resolution_hint": "exact",
    "notes": "Упомянут Центр Космонавтики и Авиации (ВДНХ) в подписи к ролику."
  },
  "canonical_key": "yt:v6cyL8hKVYQ",
  "model": "google/gemini-3.5-flash-lite",
  "usage": {
    "prompt_tokens": 3538,
    "candidates_tokens": 170,
    "thoughts_tokens": 0,
    "cached_tokens": 0,
    "total_tokens": 3708
  },
  "latency_ms": 1524.06,
  "cost_usd": 0.001486,
  "cache_hit": false
}
```

## Проверки (команда → результат)

- `cd ml/extract-lab && uv run ruff check . && uv run ruff format --check .` → `PASS` (`All checks passed!`, `15 files already formatted`)
- `cd ml/extract-lab && uv run mypy src tests` → `PASS` (`Success: no issues found in 13 source files`)
- `cd ml/extract-lab && uv run pytest` → `PASS` (`50 passed, 1 deselected in 0.44s`)
- `cd ml/extract-lab && HTTPS_PROXY=socks5h://127.0.0.1:2080 uv run pytest -m live` → `PASS` (`1 passed, 50 deselected in 2.09s`)
- `pnpm check` (в корне рабочей копии) → `PASS` (`format:check`, `lint`, `lint:fsd`, `typecheck`, `test` — 78 файлов, 224 теста)

## Изменённые файлы

- `ml/extract-lab/.env.example`
- `ml/extract-lab/README.md`
- `ml/extract-lab/pricing.json`
- `ml/extract-lab/pyproject.toml`
- `ml/extract-lab/uv.lock`
- `ml/extract-lab/src/extractlab/__init__.py`
- `ml/extract-lab/src/extractlab/cli.py`
- `ml/extract-lab/src/extractlab/gemini_client.py`
- `ml/extract-lab/src/extractlab/openrouter_client.py`
- `ml/extract-lab/tests/test_cli.py`
- `ml/extract-lab/tests/test_openrouter_client.py`

## Что осталось / риски

- Все пункты задачи `K4-B1b` выполнены. Для работы с российских IP требуется запущенный локальный SOCKS5-прокси (`HTTPS_PROXY=socks5h://127.0.0.1:2080`).
