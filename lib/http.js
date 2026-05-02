const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const BODY_LIMIT_BYTES = 64 * 1024;
const buckets = new Map();

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
}

function handleOptions(req, res) {
  setCorsHeaders(res);

  if (req.method !== 'OPTIONS') {
    return false;
  }

  res.statusCode = 204;
  res.end();
  return true;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'anonymous';
}

function applyRateLimit(req, res) {
  const now = Date.now();
  const key = clientKey(req);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  current.count += 1;

  if (current.count <= RATE_LIMIT_MAX) {
    return true;
  }

  res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
  sendJson(res, 429, {
    success: false,
    error: 'Too many download requests from this IP. Please try again in a minute.',
  });
  return false;
}

function parseJson(raw) {
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const invalidJson = new Error('Request body must be valid JSON.');
    invalidJson.statusCode = 400;
    throw invalidJson;
  }
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === 'string') {
    return Promise.resolve(parseJson(req.body));
  }

  if (Buffer.isBuffer(req.body)) {
    return Promise.resolve(parseJson(req.body.toString('utf8')));
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    let rejected = false;

    req.on('data', (chunk) => {
      raw += chunk;

      if (raw.length > BODY_LIMIT_BYTES && !rejected) {
        rejected = true;
        const tooLarge = new Error('Request body is too large.');
        tooLarge.statusCode = 413;
        reject(tooLarge);
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!rejected) {
        resolve(parseJson(raw));
      }
    });

    req.on('error', reject);
  });
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  sendJson(res, 405, {
    success: false,
    error: 'Method not allowed.',
  });
}

module.exports = {
  applyRateLimit,
  handleOptions,
  methodNotAllowed,
  readJsonBody,
  sendJson,
  setCorsHeaders,
};
