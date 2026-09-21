# InstaFlow Backend

Backend-only FastAPI service for permitted public Instagram Reels and video posts.

Start:

`uvicorn app:app --host 0.0.0.0 --port $PORT`

## API

### Health

`GET /health`

### Resolve a Reel or video post

`GET /api/resolve?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC123%2F`

or:

`POST /api/resolve`

```json
{
  "url": "https://www.instagram.com/reel/ABC123/"
}
```

Example response:

```json
{
  "ok": true,
  "platform": "instagram",
  "type": "video",
  "id": "ABC123",
  "title": "Instagram video",
  "uploader": "creator",
  "thumbnail": "https://...",
  "duration": 25,
  "width": 1080,
  "height": 1920,
  "ext": "mp4",
  "format": "Best available",
  "sourceUrl": "https://www.instagram.com/reel/ABC123/",
  "downloadUrl": "/api/download?url=..."
}
```

### Download

`GET /api/download?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC123%2F`

The backend prepares the best available MP4-compatible public rendition and returns it as a file attachment. It does not maintain a download history.

## Limits

- Public/authorized Instagram media only
- Reels, `/p/` video posts and legacy `/tv/` links
- 100 MB maximum file size
- 10 minute maximum duration
- 120 second download timeout
- Two concurrent downloads and four concurrent resolves per instance

## Instagram reliability

The backend uses a browser User-Agent, retry handling, and can optionally use the user's own Instagram session cookies to reduce anonymous hosting-provider rate limits. It does not bypass private-account or access restrictions.

Supported Render environment variables:

- `INSTAGRAM_COOKIES_B64` — preferred; base64-encoded Netscape cookies.txt content
- `INSTAGRAM_COOKIES` — raw Netscape cookies.txt content
- `INSTAGRAM_SESSIONID` — optional session cookie fallback
- `INSTAGRAM_CSRFTOKEN` — optional CSRF cookie
- `INSTAGRAM_DS_USER_ID` — optional Instagram user ID cookie
- `INSTAGRAM_USER_AGENT` — optional browser User-Agent override
- `ALLOWED_ORIGINS` — frontend origin allowed by CORS

Do not commit cookies or session credentials to GitHub. Store them only as secret environment variables in Render.
