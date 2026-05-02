const { handleOptions, sendJson, setCorsHeaders } = require('../lib/http');

module.exports = function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }

  setCorsHeaders(res);
  sendJson(res, 404, {
    success: false,
    error: 'API route not found.',
  });
};
