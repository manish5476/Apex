// src/config/logger.js - Smart & Lightweight
const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Only create logs directory if we're actually going to write files
const shouldLogToFile = process.env.LOG_TO_FILE === "true" && process.env.NODE_ENV === "production";
const logsDir = path.join(__dirname, "../logs");

if (shouldLogToFile && !fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure transports based on environment
const transports = [];

// 1. ALWAYS have console transport (minimal impact)
transports.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    // In production, only log warnings and errors to console
    level: process.env.NODE_ENV === "development" ? "debug" : "warn",
  })
);

// 2. OPTIONAL: File logging only in production when explicitly enabled
if (shouldLogToFile) {
  const DailyRotateFile = require("winston-daily-rotate-file");
  
  transports.push(
    new DailyRotateFile({
      dirname: logsDir,
      filename: "error-%DATE%.log", // Only ERROR logs to file
      datePattern: "YYYY-MM-DD",
      level: "error", // ONLY errors go to file
      maxSize: "5m",  // 5MB max per file
      maxFiles: "7d", // Keep only 7 days of logs
      zippedArchive: false, // Don't zip (saves CPU)
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }), // Shorter timestamp
    winston.format.simple() // Simple format, not verbose JSON
  ),
  transports,
  
  // IMPORTANT: Don't create empty exception/rejection handlers
  // Only add them if we have file transport
  ...(shouldLogToFile ? {
    exceptionHandlers: [
      new winston.transports.File({
        dirname: logsDir,
        filename: 'exceptions.log',
        maxsize: 5242880, // 5MB
        maxFiles: 1, // Only keep 1 exceptions file
      })
    ],
    rejectionHandlers: [
      new winston.transports.File({
        dirname: logsDir,
        filename: 'rejections.log',
        maxsize: 5242880, // 5MB
        maxFiles: 1,
      })
    ]
  } : {})
});

// Export a memory-efficient stream for HTTP logging
logger.stream = {
  write: (message) => {
    // Only log HTTP requests in development or if explicitly enabled
    if (process.env.NODE_ENV === "development" || process.env.LOG_HTTP === "true") {
      logger.info(message.trim());
    }
  },
};

module.exports = logger;
