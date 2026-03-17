/**
 * validate.js — Request validation helpers
 */

// Sanitize string input — trim and limit length
function sanitizeStr(val, maxLen = 255) {
  if (typeof val !== 'string') return '';
  return val.trim().substring(0, maxLen);
}

// Validate and coerce positive integer from query param
function parsePositiveInt(val, defaultVal = 1, max = null) {
  const n = parseInt(val);
  if (isNaN(n) || n < 1) return defaultVal;
  if (max !== null) return Math.min(n, max);
  return n;
}

module.exports = { sanitizeStr, parsePositiveInt };
