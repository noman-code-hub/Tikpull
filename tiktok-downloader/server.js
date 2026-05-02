const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const { scrapeTikTokVideo, TIKTOK_HEADERS } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many download requests from this IP. Please try again in a minute.',
  },
});

app.use(cors());
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/download', downloadLimiter, async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Please provide a TikTok URL.',
      });
    }

    const result = await scrapeTikTokVideo(url);
    return res.json(result);
  } catch (error) {
    console.error('Download failed:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message || 'Unable to fetch this TikTok video.',
    });
  }
});

function isAllowedMediaHost(hostname) {
  const host = hostname.toLowerCase();
  const allowedHosts = [
    'tiktok.com',
    'tiktokcdn.com',
    'tiktokv.com',
    'muscdn.com',
    'byteoversea.com',
    'ibytedtos.com',
  ];

  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function contentTypeFor(kind) {
  if (kind === 'audio') {
    return 'audio/mpeg';
  }

  if (kind === 'image') {
    return 'image/jpeg';
  }

  return 'video/mp4';
}

function buildMediaHeaders(req, type, referer) {
  const headers = {
    'User-Agent': TIKTOK_HEADERS['User-Agent'],
    Accept: type === 'audio' ? 'audio/*,*/*;q=0.8' : 'video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8',
    'Accept-Language': TIKTOK_HEADERS['Accept-Language'],
    'Accept-Encoding': 'identity;q=1, *;q=0',
    Referer: referer || 'https://www.tiktok.com/',
    Origin: 'https://www.tiktok.com',
    'sec-fetch-dest': type === 'audio' ? 'audio' : 'video',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'same-site',
  };

  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  return headers;
}

app.get('/api/stream', downloadLimiter, async (req, res) => {
  try {
    const { url, filename = 'tiktok-download.mp4', type = 'video', referer } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'A media URL is required.',
      });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'The media URL is not valid.',
      });
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || !isAllowedMediaHost(parsed.hostname)) {
      return res.status(400).json({
        success: false,
        error: 'Only TikTok media URLs can be streamed.',
      });
    }

    let safeReferer = 'https://www.tiktok.com/';
    if (referer && typeof referer === 'string') {
      try {
        const parsedReferer = new URL(referer);
        if (isAllowedMediaHost(parsedReferer.hostname)) {
          safeReferer = parsedReferer.toString();
        }
      } catch (error) {
        safeReferer = 'https://www.tiktok.com/';
      }
    }

    const headers = buildMediaHeaders(req, type, safeReferer);

    const mediaResponse = await fetch(parsed.toString(), {
      method: 'GET',
      headers,
      redirect: 'follow',
      follow: 10,
    });

    if (!mediaResponse.ok && mediaResponse.status !== 206) {
      return res.status(mediaResponse.status).json({
        success: false,
        error: `TikTok CDN returned HTTP ${mediaResponse.status}. Please fetch a fresh link and try again.`,
      });
    }

    const safeFilename = String(filename)
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90) || 'tiktok-download.mp4';

    res.status(mediaResponse.status);
    res.setHeader('Content-Type', mediaResponse.headers.get('content-type') || contentTypeFor(type));
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

    const contentLength = mediaResponse.headers.get('content-length');
    const contentRange = mediaResponse.headers.get('content-range');
    const acceptRanges = mediaResponse.headers.get('accept-ranges');

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }

    if (acceptRanges) {
      res.setHeader('Accept-Ranges', acceptRanges);
    }

    return mediaResponse.body.pipe(res);
  } catch (error) {
    console.error('Stream failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Unable to stream this TikTok media file.',
    });
  }
});

function sendPublicPage(res, fileName) {
  res.sendFile(path.join(__dirname, 'public', fileName));
}

app.get('/about', (req, res) => {
  sendPublicPage(res, 'about.html');
});

app.get('/privacy', (req, res) => {
  sendPublicPage(res, 'privacy.html');
});

app.get('/terms', (req, res) => {
  sendPublicPage(res, 'terms.html');
});

app.get('/contact', (req, res) => {
  sendPublicPage(res, 'contact.html');
});

app.get('/blog', (req, res) => {
  sendPublicPage(res, 'blog.html');
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found.',
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TikTok downloader running at http://localhost:${PORT}`);
  });
}

module.exports = app;
