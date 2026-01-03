// src/config/middlewareConfig.js
const compression = require("compression");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const cors = require("cors");
const { updateSessionActivity } = require("../core/middleware/session.middleware");
const assignRequestId = require("../core/middleware/requestId.middleware");
const logger = require("./logger");

/**
 * Middleware configuration manager
 */
const middlewareConfig = {
  /**
   * CORS configuration
   */
  corsConfig: cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : ["http://localhost:4200", "https://apex-infinity.vercel.app"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-API-Key"],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    exposedHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
  }),

  /**
   * Morgan logging configuration
   */
  morganConfig: {
    development: morgan(":id :method :url :status :response-time ms"),
    production: morgan(
      ':id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
      {
        stream: { write: (msg) => logger.info(msg.trim()) },
        skip: (req) => req.path === "/health", // Skip health checks
      }
    ),
  },

  /**
   * Apply all standard middleware
   */
  applyStandardMiddleware(app) {
    // 1. Request ID (First)
    app.use(assignRequestId);

    // 2. CORS
    app.use(this.corsConfig);
    app.options("*", this.corsConfig);

    // 3. Preflight handling
    app.use((req, res, next) => {
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
        return res.sendStatus(204);
      }
      next();
    });

    // 4. Cookie parser
    app.use(cookieParser());

    // 5. Compression
    app.use(compression({ level: 6 }));

    // 6. Logging
    if (process.env.NODE_ENV === "development") {
      app.use(this.morganConfig.development);
    } else {
      app.use(this.morganConfig.production);
    }

    // 7. Session activity tracking
    app.use(updateSessionActivity);

    return app;
  },

  /**
   * Apply performance middleware
   */
  applyPerformanceMiddleware(app) {
    // Request timeout
    app.use((req, res, next) => {
      req.setTimeout(30000, () => {
        logger.warn(`Request timeout: ${req.id} ${req.method} ${req.url}`);
        if (!res.headersSent) {
          res.status(408).json({ 
            error: "Request timeout", 
            requestId: req.id 
          });
        }
      });
      res.setTimeout(30000);
      next();
    });

    // Response caching headers
    app.use((req, res, next) => {
      if (req.method === "GET") {
        res.set("Cache-Control", "private, max-age=60");
      }
      next();
    });

    return app;
  },

  /**
   * Maintenance mode middleware
   */
  maintenanceMode: (req, res, next) => {
    if (process.env.MAINTENANCE_MODE === "true" && req.path !== "/health") {
      return res.status(503).json({
        status: "maintenance",
        message: "Service is undergoing maintenance",
        estimatedRestoration: process.env.MAINTENANCE_ETA || "Soon",
        timestamp: new Date().toISOString(),
      });
    }
    next();
  },
};

module.exports = middlewareConfig;