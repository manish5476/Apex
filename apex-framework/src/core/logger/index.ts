import winston from 'winston';
import path from 'path';
import fs from 'fs';
import DailyRotateFile from 'winston-daily-rotate-file';

const shouldLogToFile = process.env.LOG_TO_FILE === 'true' && process.env.NODE_ENV === 'production';
const logsDir = path.join(__dirname, '../../../logs');

if (shouldLogToFile && !fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'warn',
  }),
];

if (shouldLogToFile) {
  transports.push(
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '5m',
      maxFiles: '7d',
      zippedArchive: false,
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.simple()
  ),
  transports,
  ...(shouldLogToFile
    ? {
        exceptionHandlers: [
          new winston.transports.File({
            dirname: logsDir,
            filename: 'exceptions.log',
            maxsize: 5242880,
            maxFiles: 1,
          }),
        ],
        rejectionHandlers: [
          new winston.transports.File({
            dirname: logsDir,
            filename: 'rejections.log',
            maxsize: 5242880,
            maxFiles: 1,
          }),
        ],
      }
    : {}),
});

export const loggerStream = {
  write: (message: string): void => {
    if (process.env.NODE_ENV === 'development' || process.env.LOG_HTTP === 'true') {
      logger.info(message.trim());
    }
  },
};

export default logger;