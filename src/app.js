
//
const qs = require("qs");
const express = require("express");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const cors = require("cors");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./bootstrap/swagger");
const globalErrorHandler = require("./core/error/errorController");
const AppError = require("./core/utils/api/appError");
const logger = require("./bootstrap/logger");
const { updateSessionActivity } = require("./core/middleware/session.middleware");
const assignRequestId = require("./core/middleware/requestId");

// ---------------------- ROUTES ----------------------
const registerRoutes = require("./routes/routeRegistrynew");

const app = express();
// import registerRoutes from './routes/routeRegistry.js';
// registerRoutes(app);
app.set("trust proxy", 1);
app.set("query parser", (str) => qs.parse(str, { defaultCharset: "utf-8" }));
app.use(assignRequestId);
// app.use(
//   cors({
//     origin: process.env.CORS_ORIGIN
//       ? process.env.CORS_ORIGIN.split(",")
//       : [
//         "http://localhost:4200",
//         "http://localhost:8081",
//         "http://10.155.124.42:8081",
//         "http://10.155.124.42:5000",
//         "https://apex-infinity.vercel.app",
//         "https://apex-infinity-vert.vercel.app"
//       ],
//     credentials: true,
//     allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
//     methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
//   }),
// );
// app.options("*", cors());

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : [
        "http://localhost:4200",
        "http://localhost:8081",
        "https://apex-infinity.vercel.app",
        "https://apex-infinity-vert.vercel.app"
      ];

    // In development, allow all origins to accommodate dynamic local IPs
    if (process.env.NODE_ENV === "development" || !origin) {
      console.log(`✅ CORS: Accepted origin ${origin || 'Local/No Origin'} [${process.env.NODE_ENV}]`);
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('exp://')) {
      console.log(`✅ CORS: Allowed specific origin ${origin}`);
      callback(null, true);
    } else {
      console.warn(`❌ CORS: Rejected origin ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
};

app.use(cors(corsOptions));


app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());
app.use(compression());
morgan.token("id", (req) => req.id);
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(
    morgan(
      ':id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length]',
      {
        stream: { write: (msg) => logger.info(msg.trim()) },
      },
    ),
  );
}

// ---------------------- RATE LIMITING FOR PUBLIC ----------------------
app.use(
  '/public',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
  })
  // REMOVED route mounting here to do it cleaner below
);

// F. Session Activity
app.use(updateSessionActivity);

// G. Rate Limiting for API
app.use(
  "/api/v1",
  rateLimit({
    limit: 2000,
    windowMs: 60 * 60 * 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
  }),
);

// ---------------------- 3. HEALTH CHECK ----------------------
// --- ADD THIS BLOCK ---
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Apex Infinity API is live",
    environment: process.env.NODE_ENV
  });
});


app.get("/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const statusMap = {
    0: "DISCONNECTED",
    1: "CONNECTED",
    2: "CONNECTING",
    3: "DISCONNECTING",
  };

  const isHealthy = dbStatus === 1;

  const response = {
    status: isHealthy ? "UP" : "DEGRADED",
    timestamp: new Date().toISOString(),
    services: {
      database: statusMap[dbStatus] || "UNKNOWN",
      server: "RUNNING",
    },
    uptime: process.uptime(),
    requestId: req.id,
  };

  res.status(isHealthy ? 200 : 503).json(response);
});

// ---------------------- 4. MOUNT ROUTES ----------------------

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Register all API routes via centralized registry
registerRoutes(app);

app.use((req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
});

app.use((err, req, res, next) => {
  if (err.isOperational && err.statusCode < 500) {
    logger.warn(err.message || "Operational note", {
      requestId: req.id,
      path: req.originalUrl,
      method: req.method,
      user: req.user?._id,
    });
  } else {
    logger.error(err.message || "Unhandled error", {
      requestId: req.id,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
      user: req.user?._id,
    });
  }

  globalErrorHandler(err, req, res, next);
});

module.exports = app;
