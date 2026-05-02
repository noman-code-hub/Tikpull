const fetch = require('node-fetch');
const { TIKTOK_HEADERS } = require('../lib/scraper');
const {
  applyRateLimit,
  handleOptions,
  methodNotAllowed,
  sendJson,
  setCorsHeaders,
} = require('../lib/http');

function queryValue(req, key, fallback = '') {
  const parsed = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const value = parsed.searchParams.get(key);
  return value === null ? fallback : value;
}

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

function safeDownloadName(filename) {
  return String(filename || 'tiktok-download.mp4')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'tiktok-download.mp4';
}

function safeRefererValue(referer) {
  if (!referer || typeof referer !== 'string') {
    return 'https://www.tiktok.com/';
  }

  try {
    const parsedReferer = new URL(referer);
    if (isAllowedMediaHost(parsedReferer.hostname)) {
      return parsedReferer.toString();
    }
  } catch (error) {
    return 'https://www.tiktok.com/';
  }

  return 'https://www.tiktok.com/';
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }

  setCorsHeaders(res);

  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET, OPTIONS');
    return;
  }

  if (!applyRateLimit(req, res)) {
    return;
  }

  try {
    const url = queryValue(req, 'url');
    const filename = queryValue(req, 'filename', 'tiktok-download.mp4');
    const type = queryValue(req, 'type', 'video');
    const referer = queryValue(req, 'referer');

    if (!url) {
      sendJson(res, 400, {
        success: false,
        error: 'A media URL is required.',
      });
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      sendJson(res, 400, {
        success: false,
        error: 'The media URL is not valid.',
      });
      return;
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || !isAllowedMediaHost(parsed.hostname)) {
      sendJson(res, 400, {
        success: false,
        error: 'Only TikTok media URLs can be streamed.',
      });
      return;
    }

    const mediaResponse = await fetch(parsed.toString(), {
      method: 'GET',
      headers: buildMediaHeaders(req, type, safeRefererValue(referer)),
      redirect: 'follow',
      follow: 10,
    });

    if (!mediaResponse.ok && mediaResponse.status !== 206) {
      sendJson(res, mediaResponse.status, {
        success: false,
        error: `TikTok CDN returned HTTP ${mediaResponse.status}. Please fetch a fresh link and try again.`,
      });
      return;
    }

    res.statusCode = mediaResponse.status;
    res.setHeader('Content-Type', mediaResponse.headers.get('content-type') || contentTypeFor(type));
    res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName(filename)}"`);

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

    mediaResponse.body.on('error', (error) => {
      console.error('Stream response failed:', error.message);
      res.destroy(error);
    });

    mediaResponse.body.pipe(res);
  } catch (error) {
    console.error('Stream failed:', error.message);
    sendJson(res, 500, {
      success: false,
      error: 'Unable to stream this TikTok media file.',
    });
  }
};
