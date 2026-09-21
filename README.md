# InstaFlow

FastAPI + yt-dlp backend for permitted public Instagram videos.

Start: `uvicorn app:app --host 0.0.0.0 --port $PORT`

Health: `/health`. Download: `/api/download?url=...`.

Limits: 100 MB, 10 minutes, 90 second processing timeout, two concurrent processing requests. No login cookies or private content. Instagram can reject requests from hosting providers; a running server does not guarantee every video can be downloaded. CORS is browser policy, not authentication.
