import base64
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

app = FastAPI(docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("ALLOWED_ORIGINS", "https://instaflow-downloader.astrit-s-bunjaku.chatgpt.site")],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition"],
)

slots = threading.BoundedSemaphore(2)
resolve_slots = threading.BoundedSemaphore(4)
MAX_BYTES = 100 * 1024 * 1024
MAX_DURATION = 600
NEONFETCH_BASE = os.environ.get("NEONFETCH_BASE", "https://neonfetch-x.onrender.com").rstrip("/")
DEFAULT_IG_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/153.0.0.0 Safari/537.36"
)
IG_UA = os.environ.get("INSTAGRAM_USER_AGENT", DEFAULT_IG_UA).strip() or DEFAULT_IG_UA


class ResolveBody(BaseModel):
    url: str


def canonical_url(value):
    try:
        parsed = urlsplit(str(value or "").strip())
        valid = (
            parsed.scheme == "https"
            and parsed.hostname in {"instagram.com", "www.instagram.com"}
            and not parsed.username
            and not parsed.password
            and parsed.port in {None, 443}
        )
    except ValueError:
        valid = False

    if not valid or not re.fullmatch(r"/(?:reel|reels|p|tv)/[A-Za-z0-9_-]+/?", parsed.path):
        raise HTTPException(400, "Paste a public Instagram Reel or video post link.")

    path = parsed.path.replace("/reels/", "/reel/", 1)
    return "https://www.instagram.com" + path.rstrip("/") + "/"


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
    lines = [
        "# Netscape HTTP Cookie File",
        f".instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\t{session_id}",
    ]
    if csrf_token:
        lines.append(f".instagram.com\tTRUE\t/\tTRUE\t2147483647\tcsrftoken\t{csrf_token}")
    if ds_user_id:
        lines.append(f".instagram.com\tTRUE\t/\tTRUE\t2147483647\tds_user_id\t{ds_user_id}")
    return "\n".join(lines) + "\n"


def prepare_cookie_file(folder):
    cookie_text = instagram_cookie_text()
    if not cookie_text:
        return None

    cookie_path = Path(folder) / "instagram-cookies.txt"
    cookie_path.write_text(cookie_text, encoding="utf-8")
    try:
        os.chmod(cookie_path, 0o600)
    except OSError:
        pass
    return cookie_path


def common_ytdlp_args(cookie_path=None):
    args = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--ignore-config",
        "--no-cache-dir",
        "--no-playlist",
        "--playlist-items",
        "1",
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
    ]
    if cookie_path:
        args.extend(["--cookies", str(cookie_path)])
    return args


def diagnostic_text(result):
    diagnostic = result.stderr.decode("utf-8", errors="replace")[-5000:]
    return re.sub(r"https?://[^\s]+", "[URL]", diagnostic)


def clean_text(value, limit=160):
    value = re.sub(r"\s+", " ", str(value or "")).strip()
    return value[:limit]


def resolve_via_neonfetch(target):
    payload = json.dumps({"url": target}).encode("utf-8")
    request = Request(
        f"{NEONFETCH_BASE}/api/inspect",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": IG_UA,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=55) as response:
            data = json.loads(response.read().decode("utf-8", errors="replace"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:1000]
        logging.getLogger("uvicorn.error").error(
            "NeonFetch fallback HTTP %s: %s", exc.code, body
        )
        raise HTTPException(502, "Instagram fallback could not resolve this video.")
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        logging.getLogger("uvicorn.error").error("NeonFetch fallback failed: %s", exc)
        raise HTTPException(502, "Instagram fallback is temporarily unavailable.")

    if not data.get("ok"):
        raise HTTPException(422, clean_text(data.get("error") or "Instagram could not resolve this video.", 220))

    formats = [
        item for item in (data.get("formats") or [])
        if item.get("type") == "video" and item.get("downloadUrl")
    ]
    if not formats:
        raise HTTPException(422, "No downloadable video format was found.")

    chosen = formats[0]
    download_url = str(chosen.get("downloadUrl") or "")
    if download_url.startswith("/"):
        download_url = NEONFETCH_BASE + download_url
    elif not download_url.startswith(NEONFETCH_BASE + "/"):
        raise HTTPException(502, "Fallback returned an unexpected download URL.")

    return {
        "ok": True,
        "platform": "instagram",
        "type": "video",
        "id": None,
        "title": clean_text(data.get("title") or "Instagram video"),
        "uploader": clean_text(data.get("uploader") or "Instagram", 80),
        "thumbnail": data.get("thumbnail") if str(data.get("thumbnail") or "").startswith("http") else None,
        "duration": data.get("duration"),
        "width": None,
        "height": None,
        "ext": chosen.get("ext") or "mp4",
        "format": chosen.get("label") or chosen.get("quality") or "Best available",
        "sourceUrl": target,
        "downloadUrl": download_url,
        "engine": "neonfetch-fallback",
    }


def resolve_instagram(target):
    if not resolve_slots.acquire(blocking=False):
        raise HTTPException(429, "The resolver is busy. Please try again shortly.")

    folder = tempfile.mkdtemp(prefix="instaflow-resolve-")
    try:
        cookie_path = prepare_cookie_file(folder)
        command = common_ytdlp_args(cookie_path)
        command.extend([
            "--skip-download",
            "--dump-single-json",
            "-f",
            "best[ext=mp4]/best",
            "--",
            target,
        ])

        result = subprocess.run(command, capture_output=True, timeout=60)
        if result.returncode:
            diagnostic = diagnostic_text(result)
            logging.getLogger("uvicorn.error").error(
                "yt-dlp resolve failed (exit %s, auth=%s): %s",
                result.returncode,
                bool(cookie_path),
                diagnostic,
            )
            logging.getLogger("uvicorn.error").info("Trying NeonFetch fallback for Instagram resolve.")
            return resolve_via_neonfetch(target)

        try:
            info = json.loads(result.stdout.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            logging.getLogger("uvicorn.error").info("Invalid local metadata; trying NeonFetch fallback.")
            return resolve_via_neonfetch(target)

        if info.get("_type") == "playlist" or info.get("entries"):
            entries = [entry for entry in (info.get("entries") or []) if entry]
            if not entries:
                return resolve_via_neonfetch(target)
            info = entries[0]

        duration = info.get("duration")
        if duration and float(duration) > MAX_DURATION:
            raise HTTPException(413, "Video exceeds the 10 minute limit.")

        availability = str(info.get("availability") or "public").lower()
        if availability in {"private", "needs_auth", "premium_only", "subscriber_only"}:
            raise HTTPException(403, "Private or restricted Instagram content is not supported.")

        title = clean_text(info.get("title") or info.get("description") or "Instagram video")
        uploader = clean_text(info.get("uploader") or info.get("channel") or info.get("uploader_id") or "Instagram", 80)
        thumbnail = info.get("thumbnail") if str(info.get("thumbnail") or "").startswith("http") else None

        return {
            "ok": True,
            "platform": "instagram",
            "type": "video",
            "id": info.get("id"),
            "title": title,
            "uploader": uploader,
            "thumbnail": thumbnail,
            "duration": duration,
            "width": info.get("width"),
            "height": info.get("height"),
            "ext": info.get("ext") or "mp4",
            "format": info.get("format_note") or info.get("format") or "Best available",
            "sourceUrl": target,
            "downloadUrl": f"/api/download?url={quote(target, safe='')}",
            "engine": "instaflow-local",
        }
    finally:
        resolve_slots.release()
        shutil.rmtree(folder, ignore_errors=True)


@app.get("/")
@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "instaflow-backend",
        "version": "2.1.0",
        "instagramAuthConfigured": bool(
            os.environ.get("INSTAGRAM_COOKIES_B64")
            or os.environ.get("INSTAGRAM_COOKIES")
            or os.environ.get("INSTAGRAM_SESSIONID")
        ),
        "neonfetchFallback": True,
        "endpoints": ["/api/resolve", "/api/download"],
    }


@app.get("/api/resolve")
def resolve_get(url: str):
    return resolve_instagram(canonical_url(url))


@app.post("/api/resolve")
def resolve_post(body: ResolveBody):
    return resolve_instagram(canonical_url(body.url))


@app.get("/api/download")
def download(url: str, cleanup: BackgroundTasks):
    target = canonical_url(url)

    if not slots.acquire(blocking=False):
        raise HTTPException(429, "The downloader is busy. Please try again shortly.")

    folder = tempfile.mkdtemp(prefix="instaflow-download-")
    handed_off = False

    try:
        cookie_path = prepare_cookie_file(folder)
        command = common_ytdlp_args(cookie_path)
        command.extend([
            "--no-part",
            "--max-filesize",
            str(MAX_BYTES),
            "--match-filter",
            f"duration <= {MAX_DURATION}",
            "-f",
            "best[ext=mp4]/best",
            "-o",
            str(Path(folder) / "instagram.%(ext)s"),
            "--",
            target,
        ])

        result = subprocess.run(command, capture_output=True, timeout=120)
        if result.returncode:
            logging.getLogger("uvicorn.error").error(
                "yt-dlp download failed (exit %s, auth=%s): %s",
                result.returncode,
                bool(cookie_path),
                diagnostic_text(result),
            )
            fallback = resolve_via_neonfetch(target)
            return RedirectResponse(fallback["downloadUrl"], status_code=307)

        candidates = [
            p
            for p in Path(folder).glob("instagram.*")
            if p.is_file() and p.name != "instagram-cookies.txt" and not p.name.endswith(".part")
        ]
        if not candidates:
            fallback = resolve_via_neonfetch(target)
            return RedirectResponse(fallback["downloadUrl"], status_code=307)

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
        fallback = resolve_via_neonfetch(target)
        return RedirectResponse(fallback["downloadUrl"], status_code=307)
    finally:
        slots.release()
        if not handed_off:
            shutil.rmtree(folder, ignore_errors=True)
