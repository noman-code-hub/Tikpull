const { scrapeTikTokVideo } = require('../lib/scraper');
const {
  applyRateLimit,
  handleOptions,
  methodNotAllowed,
  readJsonBody,
  sendJson,
  setCorsHeaders,
} = require('../lib/http');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }

  setCorsHeaders(res);

  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST, OPTIONS');
    return;
  }

  if (!applyRateLimit(req, res)) {
    return;
  }

  try {
    const { url } = await readJsonBody(req);

    if (!url || typeof url !== 'string') {
      sendJson(res, 400, {
        success: false,
        error: 'Please provide a TikTok URL.',
      });
      return;
    }

    const result = await scrapeTikTokVideo(url);
    sendJson(res, 200, result);
  } catch (error) {
    const statusCode = error.statusCode || 400;
    console.error('Download failed:', error.message);
    sendJson(res, statusCode, {
      success: false,
      error: error.message || 'Unable to fetch this TikTok video.',
    });
  }
};
