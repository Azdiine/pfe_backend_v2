const errorMiddleware = (err, req, res, next) => {
  // Full stack in the server logs (never in the HTTP response in production)
  console.error(`❌ Error on ${req.method} ${req.originalUrl}:`, err.stack || err.message || err);

  const statusCode = err.statusCode || 500;
  // Unexpected errors (500) must not leak internals (SQL, file paths...) to the client
  const message = statusCode < 500
    ? err.message || 'Request failed'
    : process.env.NODE_ENV === 'development'
      ? err.message || 'Internal server error'
      : 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorMiddleware;
