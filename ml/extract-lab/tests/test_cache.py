"""Tests for SQLite ExtractionCache keyed by canonical_key or file SHA-256."""

from __future__ import annotations

from pathlib import Path

from extractlab.cache import ExtractionCache, compute_file_sha256, resolve_cache_key
from extractlab.gemini_client import FakeExtractClient


def test_cache_key_by_canonical_url_does_not_call_model_twice(tmp_path: Path) -> None:
    db_file = tmp_path / "cache.sqlite3"
    cache = ExtractionCache(db_path=db_file)
    fake_client = FakeExtractClient()

    url_with_utm = "https://www.instagram.com/reel/DC1xYz_9-aB/?igsh=abc&utm_source=ig"
    url_clean = "https://instagram.com/reels/DC1xYz_9-aB/"

    first = cache.extract_or_get(
        client=fake_client,
        video_bytes=b"sample-video",
        caption="Кафе «Полдень», Чистопрудный бульвар, 12с2, м. Чистые пруды",
        url=url_with_utm,
    )
    assert first.cache_hit is False
    assert first.canonical_key == "ig:DC1xYz_9-aB"
    assert first.cost_usd > 0.0
    assert fake_client.call_count == 1

    second = cache.extract_or_get(
        client=fake_client,
        video_bytes=b"sample-video",
        caption="Другая подпись, но тот же ролик по каноническому ключу",
        url=url_clean,
    )
    assert second.cache_hit is True
    assert second.canonical_key == "ig:DC1xYz_9-aB"
    assert second.cost_usd == 0.0
    assert second.items[0].name == "Полдень"
    assert fake_client.call_count == 1


def test_cache_key_by_file_sha256_when_url_not_provided(tmp_path: Path) -> None:
    video_file = tmp_path / "clip.mp4"
    video_bytes = b"\x00\x00\x00\x18ftypmp42-test-clip-content"
    video_file.write_bytes(video_bytes)

    expected_sha_key = compute_file_sha256(video_file)
    assert expected_sha_key.startswith("sha256:")
    assert resolve_cache_key(file_path=video_file) == expected_sha_key

    cache = ExtractionCache(db_path=":memory:")
    fake_client = FakeExtractClient()

    first = cache.extract_or_get(
        client=fake_client,
        video_bytes=video_bytes,
        file_path=video_file,
        caption="Бар «Underdog», ул. Маросейка, 6-8с1, м. Китай-город",
    )
    assert first.cache_hit is False
    assert first.canonical_key == expected_sha_key
    assert fake_client.call_count == 1

    second = cache.extract_or_get(
        client=fake_client,
        video_bytes=video_bytes,
        file_path=video_file,
        caption="Бар «Underdog», ул. Маросейка, 6-8с1, м. Китай-город",
    )
    assert second.cache_hit is True
    assert second.canonical_key == expected_sha_key
    assert second.cost_usd == 0.0
    assert fake_client.call_count == 1
    cache.close()
