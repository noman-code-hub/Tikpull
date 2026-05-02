# TikTok Downloader

A Node.js Express TikTok video downloader with a custom scraper backend and a static dark-themed frontend.

## Project Structure

```text
tiktok-downloader/
├── public/
│   └── index.html
├── server.js
├── scraper.js
├── package.json
└── package-lock.json
```

## Backend

- `POST /api/download` accepts `{ "url": "https://www.tiktok.com/@user/video/123" }`.
- `GET /api/stream` streams validated TikTok media URLs with media-friendly headers for browser downloads.
- `GET /api/health` returns `{ "status": "ok" }`.
- Uses browser-like headers and follows redirects for `vm.tiktok.com`, `vt.tiktok.com`, and full TikTok video URLs.
- Extracts video data from `__UNIVERSAL_DATA_FOR_REHYDRATION__`, with `__NEXT_DATA__` fallback.
- Does not store videos. Downloads are streamed through the server only when the browser cannot access TikTok media URLs directly.
- Rate limited to 10 download requests per minute per IP.

## Setup

```bash
npm install
node server.js
# Open http://localhost:3000
```

## Notes

TikTok CDN URLs expire. Request fresh links when downloading. Only download videos you own or have permission to use.
