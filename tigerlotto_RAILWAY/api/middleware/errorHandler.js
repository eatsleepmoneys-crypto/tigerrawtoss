/**
 * errorHandler.js — Centralized error handler
 * ป้องกัน stack trace และข้อความ error ภายในรั่วไปยัง client ใน production
 */

const errorHandler = (err, req, res, _next) => {
  // Log full error internally
  console.error(`[ERROR] ${req.method} ${req.path}`, {
    message: err.message,
    stack:   process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    user:    req.user?.id,
  });

  const statusCode = err.status || err.statusCode || 500;

  // In production: never expose internal error details
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่'
    : err.message;

  res.status(statusCode).json({
    error:   err.code || 'SERVER_ERROR',
    message,
  });
};

module.exports = errorHandler;
