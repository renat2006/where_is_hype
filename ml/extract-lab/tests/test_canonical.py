"""Tests for URL canonicalization across supported platforms (15+ URLs)."""

from __future__ import annotations

import pytest

from extractlab.canonical import canonicalize_url, strip_tracking_params


@pytest.mark.parametrize(
    ("raw_url", "expected_key"),
    [
        # 1-4: Instagram Reels & posts with garbage query params
        (
            "https://www.instagram.com/reel/DC1xYz_9-aB/?igsh=MzRlODBiNWFlZA==&utm_source=ig_web",
            "ig:DC1xYz_9-aB",
        ),
        (
            "https://instagram.com/reels/C9kLmNoPqRs/?utm_medium=copy_link",
            "ig:C9kLmNoPqRs",
        ),
        (
            "https://www.instagram.com/p/DB8vWxYz123/?igshid=YmMyMTA2M2Y=",
            "ig:DB8vWxYz123",
        ),
        (
            "https://m.instagram.com/moscow_foodie/reel/DA7aBcDeFgH/?hl=ru",
            "ig:DA7aBcDeFgH",
        ),
        # 5-7: TikTok full and short links
        (
            "https://www.tiktok.com/@gdehype/video/7431234567890123456?_t=8qZ123&_r=1&is_from_webapp=1",
            "tt:7431234567890123456",
        ),
        (
            "https://m.tiktok.com/v/7409876543210987654.html?utm_source=copy",
            "tt:7409876543210987654",
        ),
        (
            "https://vt.tiktok.com/ZSj8kLmNo/?_r=1",
            "tt:ZSj8kLmNo",
        ),
        # 8-10: YouTube Shorts and watch links
        (
            "https://www.youtube.com/shorts/dQw4w9WgXcQ?si=9a8b7c6d5e4f&feature=share",
            "yt:dQw4w9WgXcQ",
        ),
        (
            "https://m.youtube.com/shorts/AbCdEfGh123?utm_campaign=share",
            "yt:AbCdEfGh123",
        ),
        (
            "https://youtu.be/XyZ98765432?si=abcdef123456",
            "yt:XyZ98765432",
        ),
        # 11-13: VK Clips (vk.com and vkvideo.ru, group and user owner IDs)
        (
            "https://vk.com/clip-12345678_456239017?utm_source=share",
            "vk:-12345678_456239017",
        ),
        (
            "https://vkvideo.ru/clip-987654_11223344?fbclid=IwAR123",
            "vk:-987654_11223344",
        ),
        (
            "https://vk.com/clips-12345678?z=clip-12345678_456239017%2Fpl_clips_t",
            "vk:-12345678_456239017",
        ),
        (
            "https://vk.com/clip55443322_99887766",
            "vk:55443322_99887766",
        ),
        # 15-17: Telegram channel posts (direct and /s/ web view)
        (
            "https://t.me/sysoevfm/14512?single&utm_source=tg",
            "tg:sysoevfm:14512",
        ),
        (
            "https://t.me/s/moskvichmag/89012?comment=55",
            "tg:moskvichmag:89012",
        ),
        (
            "t.me/ges2moscow/3210",
            "tg:ges2moscow:3210",
        ),
    ],
)
def test_canonicalize_url_supported_links(raw_url: str, expected_key: str) -> None:
    assert canonicalize_url(raw_url) == expected_key


def test_strip_tracking_params_removes_garbage_and_preserves_essential() -> None:
    dirty = (
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=garbage123"
        "&utm_source=ig&utm_medium=social&igsh=xyz#section"
    )
    assert strip_tracking_params(dirty) == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


@pytest.mark.parametrize(
    "bad_url",
    [
        "",
        "   ",
        "https://example.com/some/page",
        "https://www.instagram.com/explore/tags/moscow/",
        "https://t.me/joinchat/AAAAAE",
        "ftp://instagram.com/reel/ABC123",
    ],
)
def test_canonicalize_url_rejects_invalid_or_unsupported(bad_url: str) -> None:
    with pytest.raises(ValueError, match=r"(URL|Unsupported|Cannot extract|Invalid)"):
        canonicalize_url(bad_url)
