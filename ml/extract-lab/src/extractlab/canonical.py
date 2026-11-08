"""URL canonicalization for short-form video platforms."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

_IG_HOSTS = frozenset(
    {
        "instagram.com",
        "www.instagram.com",
        "m.instagram.com",
        "instagr.am",
        "www.instagr.am",
        "ddinstagram.com",
    }
)
_TT_HOSTS = frozenset(
    {
        "tiktok.com",
        "www.tiktok.com",
        "m.tiktok.com",
        "vt.tiktok.com",
        "vm.tiktok.com",
    }
)
_YT_HOSTS = frozenset(
    {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
        "www.youtu.be",
    }
)
_VK_HOSTS = frozenset(
    {
        "vk.com",
        "www.vk.com",
        "m.vk.com",
        "vkvideo.ru",
        "www.vkvideo.ru",
        "m.vkvideo.ru",
    }
)
_TG_HOSTS = frozenset(
    {
        "t.me",
        "www.t.me",
        "telegram.me",
        "www.telegram.me",
        "telegram.dog",
    }
)

_GARBAGE_PARAMS = frozenset(
    {
        "igsh",
        "igshid",
        "si",
        "feature",
        "is_from_webapp",
        "sender_device",
        "web_id",
        "_r",
        "_t",
        "checksum",
        "sec_user_id",
        "share_app_id",
        "share_item_id",
        "share_link_id",
        "social_sharing",
        "single",
        "comment",
        "fbclid",
        "gclid",
        "yclid",
        "hl",
    }
)

_IG_CODE_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_YT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,20}$")
_VK_CLIP_RE = re.compile(r"^(?:clip|video)(-?\d+_\d+)$")
_TG_CHANNEL_RE = re.compile(r"^[A-Za-z0-9_]{3,64}$")
_DIGITS_RE = re.compile(r"^\d+$")
_TT_SHORT_RE = re.compile(r"^[A-Za-z0-9_-]{5,32}$")


def _ensure_scheme(raw_url: str) -> str:
    stripped = raw_url.strip()
    if not stripped:
        raise ValueError("URL must not be empty")
    if "://" not in stripped:
        return f"https://{stripped}"
    return stripped


def strip_tracking_params(url: str) -> str:
    """Return URL with tracking/garbage query parameters and fragment removed."""
    normalized = _ensure_scheme(url)
    parts = urlsplit(normalized)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        raise ValueError(f"Invalid HTTP(S) URL: {url}")

    query_items = parse_qs(parts.query, keep_blank_values=False)
    cleaned_query: dict[str, list[str]] = {}
    for key, values in query_items.items():
        lower_key = key.lower()
        if lower_key.startswith("utm_") or lower_key in _GARBAGE_PARAMS:
            continue
        cleaned_query[key] = values

    encoded_query = urlencode(cleaned_query, doseq=True)
    return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path, encoded_query, ""))


def canonicalize_url(url: str) -> str:
    """Canonicalize supported social media URL into a platform key.

    Supported formats:
    - Instagram Reels/post -> ``ig:CODE``
    - TikTok video/shortlink -> ``tt:ID``
    - YouTube Shorts/video -> ``yt:ID``
    - VK clip/video -> ``vk:OWNER_ID``
    - Telegram channel post -> ``tg:CH:MSG``
    """
    normalized = _ensure_scheme(url)
    parts = urlsplit(normalized)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        raise ValueError(f"Unsupported or invalid URL: {url}")

    host = parts.hostname.lower() if parts.hostname else ""
    segments = [seg for seg in parts.path.split("/") if seg]
    query = parse_qs(parts.query)

    if host in _IG_HOSTS:
        return _canonicalize_instagram(segments, url)
    if host in _TT_HOSTS:
        return _canonicalize_tiktok(host, segments, url)
    if host in _YT_HOSTS:
        return _canonicalize_youtube(host, segments, query, url)
    if host in _VK_HOSTS:
        return _canonicalize_vk(segments, query, url)
    if host in _TG_HOSTS:
        return _canonicalize_telegram(segments, url)

    raise ValueError(f"Unsupported platform host '{host}' in URL: {url}")


def _canonicalize_instagram(segments: list[str], original_url: str) -> str:
    marker_kinds = {"reel", "reels", "p", "tv"}
    for idx, segment in enumerate(segments):
        if segment.lower() in marker_kinds and idx + 1 < len(segments):
            code = segments[idx + 1]
            if _IG_CODE_RE.match(code):
                return f"ig:{code}"
    raise ValueError(f"Cannot extract Instagram post/reel code from URL: {original_url}")


def _canonicalize_tiktok(host: str, segments: list[str], original_url: str) -> str:
    for idx, segment in enumerate(segments):
        if segment.lower() in {"video", "photo"} and idx + 1 < len(segments):
            video_id = segments[idx + 1]
            if _DIGITS_RE.match(video_id):
                return f"tt:{video_id}"
        if segment.lower() == "v" and idx + 1 < len(segments):
            raw_id = segments[idx + 1].removesuffix(".html")
            if _DIGITS_RE.match(raw_id):
                return f"tt:{raw_id}"
        if segment.lower() == "t" and idx + 1 < len(segments):
            short_code = segments[idx + 1]
            if _TT_SHORT_RE.match(short_code):
                return f"tt:{short_code}"

    if host in {"vt.tiktok.com", "vm.tiktok.com"} and segments:
        short_code = segments[0]
        if _TT_SHORT_RE.match(short_code):
            return f"tt:{short_code}"

    raise ValueError(f"Cannot extract TikTok video ID from URL: {original_url}")


def _canonicalize_youtube(
    host: str,
    segments: list[str],
    query: dict[str, list[str]],
    original_url: str,
) -> str:
    if host in {"youtu.be", "www.youtu.be"} and segments:
        video_id = segments[0]
        if _YT_ID_RE.match(video_id):
            return f"yt:{video_id}"

    for idx, segment in enumerate(segments):
        if segment.lower() in {"shorts", "embed", "live"} and idx + 1 < len(segments):
            video_id = segments[idx + 1]
            if _YT_ID_RE.match(video_id):
                return f"yt:{video_id}"

    if segments and segments[0].lower() == "watch":
        v_values = query.get("v", [])
        if v_values and _YT_ID_RE.match(v_values[0]):
            return f"yt:{v_values[0]}"

    raise ValueError(f"Cannot extract YouTube video ID from URL: {original_url}")


def _canonicalize_vk(
    segments: list[str],
    query: dict[str, list[str]],
    original_url: str,
) -> str:
    for segment in segments:
        match = _VK_CLIP_RE.match(segment)
        if match:
            return f"vk:{match.group(1)}"

    z_values = query.get("z", [])
    for z_val in z_values:
        first_part = z_val.split("/")[0]
        match = _VK_CLIP_RE.match(first_part)
        if match:
            return f"vk:{match.group(1)}"

    raise ValueError(f"Cannot extract VK clip ID from URL: {original_url}")


def _canonicalize_telegram(segments: list[str], original_url: str) -> str:
    if len(segments) >= 3 and segments[0].lower() in {"s", "c"}:
        channel = segments[1]
        msg_id = segments[2]
        if (_TG_CHANNEL_RE.match(channel) or _DIGITS_RE.match(channel)) and _DIGITS_RE.match(
            msg_id
        ):
            return f"tg:{channel}:{msg_id}"

    if len(segments) >= 2:
        channel = segments[0]
        msg_id = segments[1]
        if _TG_CHANNEL_RE.match(channel) and _DIGITS_RE.match(msg_id):
            return f"tg:{channel}:{msg_id}"

    raise ValueError(f"Cannot extract Telegram channel/message from URL: {original_url}")
