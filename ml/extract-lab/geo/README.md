# extract-lab / geo — база мест Москвы и матчинг (PostGIS)

Модуль загрузки геоданных Москвы из OpenStreetMap (Overpass API) в PostgreSQL/PostGIS и нечёткого гео-матчинга извлечённых названий мест для `extract-lab`.

## Атрибуция данных

Геоданные мест, адресов, станций метро и МЦК получены из проекта OpenStreetMap:

- **© OpenStreetMap contributors** (лицензия [ODbL 1.0](https://www.openstreetmap.org/copyright)).

## Схема базы данных (`schema.sql`)

Поднимается образ `postgis/postgis:17-3.5` на порту `127.0.0.1:54329` с расширениями `postgis`, `pg_trgm`, `btree_gist` и именованным томом `geo-db-data`:

- Таблица `places` — стационарные места Москвы (`osm_id`, `name`, `name_en`, `normalized_name`, `translit_name`, `category`, `brand`, `chain_key`, `chain_branch_count`, адресные поля `addr_*`, `opening_hours`, `geom Point(4326)`).
- Таблица `metro_stations` — станции Московского метрополитена и МЦК с координатами (`osm_id`, `name`, `normalized_name`, `translit_name`, `station_type`, `geom Point(4326)`).
- Индексы: `GiST` по `geom`, `geography(geom)` и `(category, geom)` (`btree_gist`), `GIN (gin_trgm_ops)` по `normalized_name`, `translit_name` и `normalized_street`.

## 1. Как поднять БД

Из каталога `ml/extract-lab/`:

```bash
docker compose -f docker-compose.geo.yml up -d --wait
```

Параметры подключения по умолчанию:

- DSN: `postgresql://where_is_hype:local-only@127.0.0.1:54329/where_is_hype_geo` (переопределяется переменной `GEO_DATABASE_URL`).

## 2. Как загрузить места и метро Москвы из OSM

Из каталога `ml/extract-lab/geo/`:

```bash
uv sync
uv run python load_osm.py
```

Скрипт `load_osm.py`:

- запрашивает Overpass API по административной границе Москвы (`relation["name"="Москва"]["admin_level"="4"]`) батчами с ограничением размера (`maxsize: 64 MiB`), паузами и автоматическими повторами по зеркалам Overpass;
- автоматически использует `HTTPS_PROXY` / `ALL_PROXY` из переменных окружения, если они заданы;
- кэширует сырые JSON-ответы в `geo/cache/` (вне git);
- заполняет таблицы `places` и `metro_stations` и пересчитывает `chain_branch_count` по `brand` или нормализованному имени.

### Ожидаемое число мест (результат реального запуска)

При загрузке Москвы из Overpass API (холодная загрузка с сетью ~`190 с`, повторная загрузка из локального кэша `geo/cache/` — `3.5 с`):

- **Всего мест (`places`):** `13 321`
- **Станций метро и МЦК (`metro_stations`):** `276`
- **Сетевых брендов (`chain_branch_count > 1`):** `1 225`

Распределение по категориям в таблице `places`:

| Категория    | Число строк |
| ------------ | ----------: |
| `cafe`       |       4 910 |
| `fast_food`  |       3 606 |
| `restaurant` |       2 645 |
| `bar`        |         856 |
| `park`       |         499 |
| `museum`     |         371 |
| `pub`        |         307 |
| `gallery`    |         127 |
| **Итого**    |  **13 321** |

## 3. Как запустить матчер (`matcher.py`)

Матчер выполняет нормализацию (нижний регистр, `ё` → `е`, снятие диакритики, кавычек и родовых слов «кафе», «бар», «ресторан» и др.), транслитерацию `RU ↔ EN`, поиск по `word_similarity` (`pg_trgm`) и фильтрацию/бустинг по гео-подсказке (`--metro` или `--street`).

Возвращаемые статусы (`status`):

- `exact` — найдено однозначное место (или конкретный филиал сети по улице/метро);
- `chain_ambiguous` — найдена сеть (`chain_branch_count > 1`), но улица/метро не указаны или под подсказку подходит несколько филиалов (сеть без адреса никогда не превращается в случайный филиал);
- `ambiguous` — найдено несколько близких по названию несетевых кандидатов;
- `not_found` — совпадений выше порога не найдено.

Примеры запуска из `ml/extract-lab/geo/`:

```bash
# Точное совпадение / транслит
uv run python matcher.py "Фланер"

# Сетевое заведение без адреса -> status: chain_ambiguous
uv run python matcher.py "Дринкит"

# Сетевое заведение с гео-подсказкой (метро или улица)
uv run python matcher.py "Surf Coffee" --street "Маросейка"
uv run python matcher.py "Дринкит" --metro "Китай-город"
```

## 4. Как запустить тесты и линтеры

Тесты работают на реальном PostgreSQL/PostGIS из `docker-compose.geo.yml` в изолированной схеме `test_geo_fixture` (40 фикстурных мест Москвы и 12 станций метро/МЦК), не затрагивая загруженную базу в `public.places`. Если Docker/PostGIS недоступен, тесты помечаются `skipped` с понятной причиной.

```bash
cd ml/extract-lab/geo
uv run pytest -v
uv run ruff check .
uv run ruff format --check .
uv run mypy .
```
