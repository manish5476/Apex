// src/middleware/security.js
const rateLimit = require("express-rate-limit");
const express = require("express");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");

/**
 * Enhanced security middleware configuration
 */
const securityMiddleware = {
  /**
   * Configure helmet with custom settings
   */
  helmetConfig: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Needed for some APIs
  }),

  /**
   * Rate limiting per endpoint type
   */
  rateLimiters: {
    // Strict limits for auth endpoints
    auth: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // 10 requests per window
      message: "Too many authentication attempts, please try again later.",
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true, // Don't count successful logins
    }),

    // General API limits
    api: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 500, // 500 requests per window
      message: "Too many requests from this IP, please try again later.",
      standardHeaders: true,
      legacyHeaders: false,
    }),

    // Strict limits for critical endpoints
    critical: rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 50, // 50 requests per hour
      message: "Rate limit exceeded for this endpoint.",
      standardHeaders: true,
      legacyHeaders: false,
    }),
  },

  /**
   * Request size limits
   */
  requestLimits: {
    json: { limit: "10mb" },
    urlencoded: { extended: true, limit: "10mb" },
  },

  /**
   * Apply all security middleware
   */
  applyAll(app) {
    // 1. Helmet for security headers
    app.use(this.helmetConfig);

    // 2. Body parsing with limits
    app.use(express.json(this.requestLimits.json));
    app.use(express.urlencoded(this.requestLimits.urlencoded));

    // 3. Data sanitization
    app.use(mongoSanitize());
    app.use(xss());
    app.use(hpp());

    // 4. Apply rate limiting based on path
    app.use("/api/v1/auth", this.rateLimiters.auth);
    app.use("/api/v1/users", this.rateLimiters.critical);
    app.use("/api/v1", this.rateLimiters.api);

    return app;
  },
};

module.exports = securityMiddleware;