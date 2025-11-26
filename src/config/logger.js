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
  level: "info",

  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json()
  ),

  transports: [
    createRotate("combined.log", "info", "14d"),   // general logs
    createRotate("error.log", "error", "30d"),      // error logs
  ],

  exceptionHandlers: [
    createRotate("exceptions.log", "error", "30d"),
  ],

  rejectionHandlers: [
    createRotate("rejections.log", "error", "30d"),
  ],
});

// Console logging ONLY in dev
if (process.env.NODE_ENV === "development") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

module.exports = logger;

// // ---------------- LOGGING (Single File per Type) ----------------

// const logsDir = path.join(__dirname, "logs");
// if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// const logger = winston.createLogger({
//   level: "info",
//   format: winston.format.combine(
//     winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
//     winston.format.json()
//   ),

//   transports: [
//     new winston.transports.File({
//       filename: path.join(logsDir, "combined.log"),
//       maxsize: 5 * 1024 * 1024, // 5MB
//       maxFiles: 1,
//       tailable: true,
//     }),

//     new winston.transports.File({
//       filename: path.join(logsDir, "error.log"),
//       level: "error",
//       maxsize: 5 * 1024 * 1024,
//       maxFiles: 1,
//       tailable: true,
//     }),
//   ],

//   exceptionHandlers: [
//     new winston.transports.File({
//       filename: path.join(logsDir, "exceptions.log"),
//       maxsize: 5 * 1024 * 1024,
//       maxFiles: 1,
//       tailable: true,
//     }),
//   ],

//   rejectionHandlers: [
//     new winston.transports.File({
//       filename: path.join(logsDir, "rejections.log"),
//       maxsize: 5 * 1024 * 1024,
//       maxFiles: 1,
//       tailable: true,
//     }),
//   ],
// });

// // Console in dev
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

// module.exports = logger;


// // // src/config/logger.js
// // const winston = require("winston");
// // const DailyRotateFile = require("winston-daily-rotate-file");
// // const path = require("path");
// // const fs = require("fs");

// // const logsDir = path.join(__dirname, "..", "logs");
// // if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

// // function createTransport(filename, level = "info") {
// //   return new DailyRotateFile({
// //     dirname: logsDir,
// //     filename,                     // <-- FIXED NAME (no date)
// //     level,
// //     datePattern: "YYYY-MM-DD",    // rotation pattern
// //     zippedArchive: false,
// //     maxSize: "5m",                // rotate when 5MB
// //     maxFiles: "14d",              // keep only 14 days
// //     auditFile: path.join(logsDir, `.${filename}-audit.json`)
// //   });
// // }

// // const logger = winston.createLogger({
// //   level: "info",
// //   format: winston.format.combine(
// //     winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
// //     winston.format.json()
// //   ),
// //   transports: [
// //     createTransport("combined.log"),
// //     createTransport("error.log", "error"),
// //   ],
// //   exceptionHandlers: [
// //     createTransport("exceptions.log")
// //   ],
// //   rejectionHandlers: [
// //     createTransport("rejections.log")
// //   ],
// // });

// // module.exports = logger;
