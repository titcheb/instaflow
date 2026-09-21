# InstaFlow

FastAPI + yt-dlp backend for permitted public Instagram videos.

Start: `uvicorn app:app --host 0.0.0.0 --port $PORT`

Health: `/health`. Download: `/api/download?url=...`.

Limits: 100 MB, 10 minutes, 120 second processing timeout, two concurrent processing requests.

## Instagram reliability

InstaFlow uses a browser User-Agent, retry handling, and can optionally use Instagram cookies to reduce anonymous hosting-provider rate limits. Cookies are only used to access public media through the user's own authenticated Instagram session; private or unauthorized content is not supported.

Supported Render environment variables:

- `INSTAGRAM_COOKIES_B64` — preferred; base64-encoded Netscape cookies.txt content.
- `INSTAGRAM_COOKIES` — raw Netscape cookies.txt content.
- `INSTAGRAM_SESSIONID` — optional session cookie fallback.
- `INSTAGRAM_CSRFTOKEN` — optional CSRF cookie when using `INSTAGRAM_SESSIONID`.
- `INSTAGRAM_DS_USER_ID` — optional Instagram user ID cookie.
- `INSTAGRAM_USER_AGENT` — optional browser User-Agent override.
- `ALLOWED_ORIGINS` — frontend origin allowed by CORS.

Do not commit cookies or session credentials to GitHub. Store them only as secret environment variables in Render.
