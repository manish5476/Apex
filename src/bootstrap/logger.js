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

// // // src/config/logger.js
// // const winston = require("winston");
// // const DailyRotateFile = require("winston-daily-rotate-file");
// // const path = require("path");
// // const fs = require("fs");

// // // Ensure logs directory exists
// // const logsDir = path.join(__dirname, "../logs");
// // if (!fs.existsSync(logsDir)) {
// //   fs.mkdirSync(logsDir, { recursive: true });
// // }

// // const createRotate = (filename, level = "info", maxFiles = "14d") =>
// //   new DailyRotateFile({
// //     dirname: logsDir,
// //     filename,
// //     datePattern: "YYYY-MM-DD",
// //     level,
// //     maxSize: "5m",
// //     maxFiles,
// //     zippedArchive: false,
// //   });

// // const logger = winston.createLogger({
// // //   level: "info",

// // //   format: winston.format.combine(
// // //     winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
// // //     winston.format.json()
// // //   ),

// // //   transports: [
// // //     createRotate("combined.log", "info", "14d"),   // general logs
// // //     createRotate("error.log", "error", "30d"),      // error logs
// // //   ],

// // //   exceptionHandlers: [
// // //     createRotate("exceptions.log", "error", "30d"),
// // //   ],

// // //   rejectionHandlers: [
// // //     createRotate("rejections.log", "error", "30d"),
// // //   ],
// // });

// // // // Console logging ONLY in dev
// // // if (process.env.NODE_ENV === "development") {
// // //   logger.add(
// // //     new winston.transports.Console({
// // //       format: winston.format.combine(
// // //         winston.format.colorize(),
// // //         winston.format.simple()
// // //       ),
// // //     })
// // //   );
// // // }

// // module.exports = logger;
// // src/config/logger.js - Ultra Lightweight Production Version
// const winston = require("winston");

// const logger = winston.createLogger({
//   // Production defaults: Only warnings and errors
//   level: process.env.NODE_ENV === "development" ? "debug" : "warn",
  
//   // Simple format to save space
//   format: winston.format.combine(
//     winston.format.timestamp({ format: "HH:mm:ss" }),
//     winston.format.printf(({ timestamp, level, message }) => {
//       return `${timestamp} [${level}]: ${message}`;
//     })
//   ),
  
//   transports: [
//     // Console only - no files, no disk usage
//     new winston.transports.Console({
//       format: winston.format.combine(
//         winston.format.colorize(),
//         winston.format.simple()
//       ),
//     }),
//   ],
  
//   // No file handlers = no disk usage
// });

// // Conditional HTTP logging
// logger.stream = {
//   write: (message) => {
//     // Skip HTTP logs in production unless needed
//     if (process.env.NODE_ENV === "development") {
//       logger.info(`HTTP: ${message.trim()}`);
//     }
//   },
// };

// module.exports = logger;