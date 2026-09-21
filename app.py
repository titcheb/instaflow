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
    allow_methods=["GET"], allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition"],
)
slots = threading.BoundedSemaphore(2)
MAX_BYTES = 100 * 1024 * 1024

def canonical_url(value):
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme == "https"
                 and parsed.hostname in {"instagram.com", "www.instagram.com"}
                 and not parsed.username and not parsed.password
                 and parsed.port in {None, 443})
    except ValueError:
        valid = False
    if not valid or not re.fullmatch(r"/(?:reel|p|tv)/[A-Za-z0-9_-]+/?", parsed.path):
        raise HTTPException(400, "Paste a public Instagram Reel or video post link.")
    return "https://www.instagram.com" + parsed.path.rstrip("/") + "/"

@app.get("/")
@app.get("/health")
def health():
    return {"ok": True, "service": "instaflow-yt-dlp"}

@app.get("/api/download")
def download(url: str, cleanup: BackgroundTasks):
    target = canonical_url(url)
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "The downloader is busy. Please try again shortly.")
    folder = tempfile.mkdtemp(prefix="instaflow-")
    handed_off = False
    try:
        command = [
            sys.executable, "-m", "yt_dlp", "--ignore-config",
            "--no-playlist", "--playlist-items", "1", "--no-part",
            "--no-warnings", "--quiet", "--socket-timeout", "15",
            "--retries", "1", "--max-filesize", str(MAX_BYTES),
            "--match-filter", "duration <= 600",
            "-f", "best[ext=mp4][protocol=https]/best[ext=mp4][protocol=http]",
            "-o", str(Path(folder) / "instagram.%(ext)s"), "--", target,
        ]
        result = subprocess.run(command, capture_output=True, timeout=90)
        if result.returncode:
            diagnostic = result.stderr.decode("utf-8", errors="replace")[-4000:]
            diagnostic = re.sub(r"https?://[^\\s]+", "[URL]", diagnostic)
            logging.getLogger("uvicorn.error").error("yt-dlp failed (exit %s): %s", result.returncode, diagnostic)
            raise HTTPException(422, "Instagram could not provide this video. It may require login or be temporarily unavailable.")
        path = Path(folder) / "instagram.mp4"
        if not path.is_file():
            raise HTTPException(422, "No supported video found. Use a video under 10 minutes and 100 MB.")
        if path.stat().st_size > MAX_BYTES:
            raise HTTPException(413, "Video exceeds the 100 MB limit.")
        cleanup.add_task(shutil.rmtree, folder, True)
        handed_off = True
        return FileResponse(path, filename="instagram-video.mp4", media_type="video/mp4", background=cleanup)
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Instagram took too long to respond. Try again later.")
    finally:
        slots.release()
        if not handed_off:
            shutil.rmtree(folder, ignore_errors=True)
