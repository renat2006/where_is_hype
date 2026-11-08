"""Tests for the `extractlab` CLI (`extractlab run --file ... --caption ... --fake`)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from extractlab.cli import main


def test_cli_run_fake_and_cache_hit(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    clip_path = tmp_path / "clip.mp4"
    clip_path.write_bytes(b"fake-mp4-binary-payload")
    cache_db = tmp_path / "cli_cache.sqlite3"

    exit_code_1 = main(
        [
            "run",
            "--file",
            str(clip_path),
            "--caption",
            "Кофейня «Полдень», Чистопрудный б-р, 12с2, м. Чистые пруды",
            "--url",
            "https://www.instagram.com/reel/DC1xYz/?igsh=tracking",
            "--cache-db",
            str(cache_db),
            "--fake",
        ]
    )
    assert exit_code_1 == 0
    out_1 = json.loads(capsys.readouterr().out)
    assert out_1["canonical_key"] == "ig:DC1xYz"
    assert out_1["cache_hit"] is False
    assert out_1["cost_usd"] > 0.0
    assert isinstance(out_1["latency_ms"], float)
    assert out_1["items"][0]["name"] == "Полдень"
    assert out_1["items"][0]["metro_hint"] == "Чистые пруды"
    assert "lat" not in out_1["items"][0]
    assert "lon" not in out_1["items"][0]

    # Second run with the same canonical URL hits SQLite cache
    exit_code_2 = main(
        [
            "run",
            "--file",
            str(clip_path),
            "--caption",
            "Кофейня «Полдень», Чистопрудный б-р, 12с2, м. Чистые пруды",
            "--url",
            "https://instagram.com/reels/DC1xYz/",
            "--cache-db",
            str(cache_db),
            "--fake",
        ]
    )
    assert exit_code_2 == 0
    out_2 = json.loads(capsys.readouterr().out)
    assert out_2["canonical_key"] == "ig:DC1xYz"
    assert out_2["cache_hit"] is True
    assert out_2["cost_usd"] == 0.0


def test_cli_run_fake_works_even_without_precreated_file(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cache_db = tmp_path / "synthetic_cache.sqlite3"
    non_existent_clip = tmp_path / "clip.mp4"

    exit_code = main(
        [
            "run",
            "--file",
            str(non_existent_clip),
            "--caption",
            "Бар «Underdog», ул. Маросейка, 6-8с1, м. Китай-город",
            "--cache-db",
            str(cache_db),
            "--fake",
        ]
    )
    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["cache_hit"] is False
    assert payload["canonical_key"].startswith("sha256:")
    assert payload["items"][0]["name"] == "Underdog"
