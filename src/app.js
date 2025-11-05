// src/app.js
const qs = require('qs');
const express = require("express");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const cors = require("cors");
const compression = require("compression");
const winston = require("winston");
const path = require("path");
const fs = require("fs");
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swaggerConfig'); // <-- 1. IMPORT

// TODO: You MUST copy 'errorController.js' and 'appError.js'
const globalErrorHandler = require("./middleware/errorController");
const AppError = require("./utils/appError");

// ------------------------------ controllers import ---------------------------
const organizationRoutes = require('./routes/v1/organizationRoutes');
const authRoutes = require('./routes/v1/authRoutes'); // <-- ADD THIS
const branchRoutes = require('./routes/v1/branchRoutes'); // <-- ADD THIS
const supplierRoutes = require('./routes/v1/supplierRoutes'); // <-- ADD THIS
const productRoutes = require('./routes/v1/productRoutes'); // <-- ADD THIS
const customerRoutes = require('./routes/v1/customerRoutes'); // <-- ADD THIS
const app = express();

app.set('query parser', (str) => {
  return qs.parse(str, { defaultCharset: 'utf-8' });
});

app.set("trust proxy", 1);

// --- 1) Logger (Winston + files) ---
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024, // 5MB
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5 * 1024 * 1024,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, "exceptions.log"),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, "rejections.log"),
    }),
  ],
});

if (process.env.NODE_ENV === "development") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  );
}

// --- 2) Security, CORS, logging, rate-limiting, parsing ---
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true,
  }),
);

// HTTP logs
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }),
  );
}

// Global rate limiter for API
app.use(
  "/api/v1",
  rateLimit({
    limit: 2000,
    windowMs: 60 * 60 * 1000, // 1 hour
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests from this IP, please try again after an hour.",
  }),
);

// Body parsing
app.use(express.json({ limit: "50kb" }));

// Handle bad JSON early
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return next(new AppError("Invalid JSON payload provided.", 400));
  }
  next(err);
});

// Sanitization & hardening
app.use(mongoSanitize());
app.use(xss());
app.use(hpp()); // Use default whitelist for now
app.use(compression());

// Request context log
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  logger.info(
    `Incoming Request: ${req.method} ${req.originalUrl} from IP: ${req.ip}`,
  );
  next();
});

// -------------------------------------------------- 3) Routes-------------------------------- ---
// (We will add our new routes here, e.g., orgRoutes, branchRoutes)

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    env: process.env.NODE_ENV,
    ts: new Date().toISOString(),
  });
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1/organization', organizationRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/branches', branchRoutes);
app.use('/api/v1/products', productRoutes); // <-- ADD THIS
app.use('/api/v1/customers', customerRoutes); // <-- ADD THIS
app.use('/api/v1/suppliers', supplierRoutes); // <-- ADD THIS
// --- 4) 404 + Global Error MW ---

// **FIXED 404 HANDLER**
// This 'app.use' runs only if no other route is matched
app.use((req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
});

// Single centralized error handler
app.use(globalErrorHandler);

module.exports = app;









// // src/app.js
// const express = require('express');
// const cors = require('cors');

// const app = express();

// // Enable CORS
// const corsOptions = {
//   // Check if there's a CORS_ORIGIN, otherwise allow all for simple dev
//   origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
//   credentials: true,
// };
// app.use(cors(corsOptions));

// // Body parser, reading data from body into req.body
// app.use(express.json({ limit: '10kb' }));
// app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// // --- API ROUTES WILL GO HERE ---
// // Example: app.use('/api/v1/users', userRouter);

// // Simple test route
// app.get('/', (req, res) => {
//   res.status(200).json({
//     status: 'success',
//     message: `Welcome to the Apex CRM API (${process.env.NODE_ENV} environment)`,
//   });
// });

// // Handle undefined routes
// // Handle undefined routes
// app.use((req, res, next) => {  res.status(404).json({
//     status: 'fail',
//     message: `Can't find ${req.originalUrl} on this server!`,
//   });
// });

// module.exports = app;