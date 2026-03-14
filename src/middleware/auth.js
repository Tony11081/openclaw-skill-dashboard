import crypto from 'node:crypto';

function safeCompare(actual = '', expected = '') {
  const left = Buffer.from(String(actual));
  const right = Buffer.from(String(expected));

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function unauthorized(res, message) {
  return res.status(401).json({
    error: message
  });
}

export function createHeaderAuth({ headerName, expectedValue, label }) {
  return function requireHeaderKey(req, res, next) {
    if (!expectedValue) {
      return res.status(500).json({
        error: `${label} is not configured on the server.`
      });
    }

    const actualValue = req.get(headerName) || '';

    if (!actualValue) {
      return unauthorized(res, `${headerName} header is required.`);
    }

    if (!safeCompare(actualValue, expectedValue)) {
      return unauthorized(res, `Invalid ${headerName} header.`);
    }

    return next();
  };
}
