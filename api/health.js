const { handleOptions, methodNotAllowed, sendJson, setCorsHeaders } = require('../lib/http');

module.exports = function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }

  setCorsHeaders(res);

  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET, OPTIONS');
    return;
  }

  sendJson(res, 200, { status: 'ok' });
};
