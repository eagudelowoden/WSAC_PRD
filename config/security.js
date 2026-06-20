const helmet = require("helmet");
const cors = require("cors");

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc : ["'self'"],
      scriptSrc  : ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      styleSrc   : ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc    : ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc     : ["'self'", "data:", "blob:"],
      connectSrc : ["'self'", "wss:", "ws:", "https://cdn.jsdelivr.net", "blob:"],
      frameSrc   : ["'self'", "blob:"],
      objectSrc  : ["'none'"],
    },
  },
});

const corsMiddleware = cors({
  origin     : [process.env.URL_BASE, "http://localhost:8081", "http://127.0.0.1:8081"].filter(Boolean),
  methods    : ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

module.exports = { helmetMiddleware, corsMiddleware };
