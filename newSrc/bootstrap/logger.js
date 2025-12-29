// src/config/logger.js
const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const createRotate = (filename, level = "info", maxFiles = "14d") =>
  new DailyRotateFile({
    dirname: logsDir,
    filename,
    datePattern: "YYYY-MM-DD",
    level,
    maxSize: "5m",
    maxFiles,
    zippedArchive: false,
  });

const logger = winston.createLogger({
//   level: "info",

//   format: winston.format.combine(
//     winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
//     winston.format.json()
//   ),

//   transports: [
//     createRotate("combined.log", "info", "14d"),   // general logs
//     createRotate("error.log", "error", "30d"),      // error logs
//   ],

//   exceptionHandlers: [
//     createRotate("exceptions.log", "error", "30d"),
//   ],

//   rejectionHandlers: [
//     createRotate("rejections.log", "error", "30d"),
//   ],
});

// // Console logging ONLY in dev
// if (process.env.NODE_ENV === "development") {
//   logger.add(
//     new winston.transports.Console({
//       format: winston.format.combine(
//         winston.format.colorize(),
//         winston.format.simple()
//       ),
//     })
//   );
// }

module.exports = logger;
