import base64
import os
import logging
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("ALLOWED_ORIGINS", "https://instaflow-downloader.astrit-s-bunjaku.chatgpt.site")],
    allow_methods=["GET"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition"],
)

slots = threading.BoundedSemaphore(2)
MAX_BYTES = 100 * 1024 * 1024
DEFAULT_IG_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/153.0.0.0 Safari/537.36"
)
IG_UA = os.environ.get("INSTAGRAM_USER_AGENT", DEFAULT_IG_UA).strip() or DEFAULT_IG_UA


def canonical_url(value):
    try:
        parsed = urlsplit(value)
        valid = (
            parsed.scheme == "https"
            and parsed.hostname in {"instagram.com", "www.instagram.com"}
            and not parsed.username
            and not parsed.password
            and parsed.port in {None, 443}
        )
    except ValueError:
        valid = False

    if not valid or not re.fullmatch(r"/(?:reel|p|tv)/[A-Za-z0-9_-]+/?", parsed.path):
        raise HTTPException(400, "Paste a public Instagram Reel or video post link.")

    return "https://www.instagram.com" + parsed.path.rstrip("/") + "/"


def normalize_cookie_text(text):
    value = str(text or "").replace("\\n", "\n").strip()
    if not value:
        return ""
    if value.startswith("# Netscape HTTP Cookie File") or value.startswith("# HTTP Cookie File"):
        return value + "\n"
    return "# Netscape HTTP Cookie File\n" + value + "\n"


def instagram_cookie_text():
    encoded = os.environ.get("INSTAGRAM_COOKIES_B64", "").strip()
    if encoded:
        try:
            decoded = base64.b64decode(encoded).decode("utf-8")
            if decoded.strip():
                return normalize_cookie_text(decoded)
        except Exception:
            logging.getLogger("uvicorn.error").warning(
                "INSTAGRAM_COOKIES_B64 could not be decoded; continuing without it."
            )

    raw = os.environ.get("INSTAGRAM_COOKIES", "").strip()
    if raw:
        return normalize_cookie_text(raw)

    session_id = os.environ.get("INSTAGRAM_SESSIONID", "").strip()
    if not session_id:
        return ""

    csrf_token = os.environ.get("INSTAGRAM_CSRFTOKEN", "").strip()
    ds_user_id = os.environ.get("INSTAGRAM_DS_USER_ID", "").strip()
    # Session cookies are intentionally written only into the per-request temp directory.
    lines = [
        "# Netscape HTTP Cookie File",
        f".instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\t{session_id}",
    ]
    if csrf_token:
        lines.append(f".instagram.com\tTRUE\t/\tTRUE\t2147483647\tcsrftoken\t{csrf_token}")
    if ds_user_id:
        lines.append(f".instagram.com\tTRUE\t/\tTRUE\t2147483647\tds_user_id\t{ds_user_id}")
    return "\n".join(lines) + "\n"


@app.get("/")
@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "instaflow-yt-dlp",
        "instagramAuthConfigured": bool(
            os.environ.get("INSTAGRAM_COOKIES_B64")
            or os.environ.get("INSTAGRAM_COOKIES")
            or os.environ.get("INSTAGRAM_SESSIONID")
        ),
    }


@app.get("/api/download")
def download(url: str, cleanup: BackgroundTasks):
    target = canonical_url(url)

    if not slots.acquire(blocking=False):
        raise HTTPException(429, "The downloader is busy. Please try again shortly.")

    folder = tempfile.mkdtemp(prefix="instaflow-")
    handed_off = False

    try:
        cookie_text = instagram_cookie_text()
        cookie_path = None
        if cookie_text:
            cookie_path = Path(folder) / "instagram-cookies.txt"
            cookie_path.write_text(cookie_text, encoding="utf-8")
            try:
                os.chmod(cookie_path, 0o600)
            except OSError:
                pass

        command = [
            sys.executable,
            "-m",
            "yt_dlp",
            "--ignore-config",
            "--no-cache-dir",
            "--no-playlist",
            "--playlist-items",
            "1",
            "--no-part",
            "--no-warnings",
            "--quiet",
            "--socket-timeout",
            "20",
            "--retries",
            "3",
            "--fragment-retries",
            "3",
            "--extractor-retries",
            "3",
            "--sleep-requests",
            "1",
            "--user-agent",
            IG_UA,
            "--add-header",
            "Referer:https://www.instagram.com/",
            "--add-header",
            "Accept-Language:en-US,en;q=0.9",
            "--max-filesize",
            str(MAX_BYTES),
            "--match-filter",
            "duration <= 600",
            "-f",
            "best[ext=mp4]/best",
            "-o",
            str(Path(folder) / "instagram.%(ext)s"),
        ]

        if cookie_path:
            command.extend(["--cookies", str(cookie_path)])

        command.extend(["--", target])

        result = subprocess.run(command, capture_output=True, timeout=120)

        if result.returncode:
            diagnostic = result.stderr.decode("utf-8", errors="replace")[-4000:]
            diagnostic = re.sub(r"https?://[^\s]+", "[URL]", diagnostic)
            logging.getLogger("uvicorn.error").error(
                "yt-dlp failed (exit %s, auth=%s): %s",
                result.returncode,
                bool(cookie_path),
                diagnostic,
            )
            raise HTTPException(
                422,
                "Instagram could not provide this video. If it works in NeonFetch, configure the same Instagram cookies on InstaFlow.",
            )

        candidates = [
            p
            for p in Path(folder).glob("instagram.*")
            if p.is_file() and p.name != "instagram-cookies.txt" and not p.name.endswith(".part")
        ]
        if not candidates:
            raise HTTPException(422, "No supported video found. Use a video under 10 minutes and 100 MB.")

        path = max(candidates, key=lambda p: p.stat().st_size)
        if path.stat().st_size > MAX_BYTES:
            raise HTTPException(413, "Video exceeds the 100 MB limit.")

        cleanup.add_task(shutil.rmtree, folder, True)
        handed_off = True

        suffix = path.suffix.lower() or ".mp4"
        media_type = "video/mp4" if suffix == ".mp4" else "application/octet-stream"
        return FileResponse(
            path,
            filename=f"instagram-video{suffix}",
            media_type=media_type,
            background=cleanup,
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Instagram took too long to respond. Try again later.")
    finally:
        slots.release()
        if not handed_off:
            shutil.rmtree(folder, ignore_errors=True)
