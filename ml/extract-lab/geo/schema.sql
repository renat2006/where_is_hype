CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS places (
    osm_id BIGINT PRIMARY KEY,
    osm_type TEXT NOT NULL DEFAULT 'node',
    name TEXT NOT NULL,
    name_en TEXT,
    normalized_name TEXT NOT NULL,
    translit_name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    brand TEXT,
    normalized_brand TEXT,
    chain_key TEXT,
    chain_branch_count INTEGER NOT NULL DEFAULT 1,
    addr_city TEXT,
    addr_district TEXT,
    addr_street TEXT,
    normalized_street TEXT,
    addr_housenumber TEXT,
    addr_postcode TEXT,
    address_full TEXT,
    opening_hours TEXT,
    geom geometry(Point, 4326) NOT NULL,
    raw_tags JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metro_stations (
    osm_id BIGINT PRIMARY KEY,
    osm_type TEXT NOT NULL DEFAULT 'node',
    name TEXT NOT NULL,
    name_en TEXT,
    normalized_name TEXT NOT NULL,
    translit_name TEXT NOT NULL DEFAULT '',
    line_name TEXT,
    network TEXT,
    station_type TEXT NOT NULL DEFAULT 'subway',
    geom geometry(Point, 4326) NOT NULL,
    raw_tags JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_places_geom_gist
    ON places USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_places_geog_gist
    ON places USING GIST (geography(geom));

CREATE INDEX IF NOT EXISTS idx_places_category_geom_gist
    ON places USING GIST (category, geom);

CREATE INDEX IF NOT EXISTS idx_places_normalized_name_trgm
    ON places USING GIN (normalized_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_places_translit_name_trgm
    ON places USING GIN (translit_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_places_normalized_street_trgm
    ON places USING GIN (normalized_street gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_places_chain_key
    ON places (chain_key);

CREATE INDEX IF NOT EXISTS idx_metro_stations_geom_gist
    ON metro_stations USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_metro_stations_geog_gist
    ON metro_stations USING GIST (geography(geom));

CREATE INDEX IF NOT EXISTS idx_metro_stations_normalized_name_trgm
    ON metro_stations USING GIN (normalized_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_metro_stations_translit_name_trgm
    ON metro_stations USING GIN (translit_name gin_trgm_ops);
