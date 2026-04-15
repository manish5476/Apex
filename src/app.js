
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
    // Mobile apps (React Native) often don't send an origin header.
    // If there's no origin, it's likely a mobile API call or a server-to-server call.
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : [
        "http://localhost:4200",
        "http://localhost:8081",
        "http://10.155.124.42:8081",
        "http://10.155.124.42:5000",
        "https://apex-infinity.vercel.app",
        "https://apex-infinity-vert.vercel.app"
      ];

    // Also allow local Expo Go origins like exp://...
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('exp://')) {
      callback(null, true);
    } else {
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
  app.use(morgan(":id :method :url :status :response-time ms"));
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




















// //
// const qs = require("qs");
// const express = require("express");
// const morgan = require("morgan");
// const rateLimit = require("express-rate-limit");
// const helmet = require("helmet");
// const mongoSanitize = require("express-mongo-sanitize");
// const xss = require("xss-clean");
// const hpp = require("hpp");
// const cors = require("cors");
// const compression = require("compression");
// const cookieParser = require("cookie-parser");
// const mongoose = require("mongoose");
// const swaggerUi = require("swagger-ui-express");
// const swaggerSpec = require("./bootstrap/swagger");
// const globalErrorHandler = require("./core/error/errorController");
// const AppError = require("./core/utils/api/appError");
// const logger = require("./bootstrap/logger");
// const { updateSessionActivity } = require("./core/middleware/session.middleware");
// const assignRequestId = require("./core/middleware/requestId");

// // ---------------------- ROUTES ----------------------
// const organizationRoutes = require("./routes/v1/organization.routes.js");
// const organizationExtrasRoutes = require("./routes/v1/organizationExtras.routes.js");
// const authRoutes = require("./routes/v1/auth.routes.js");
// const branchRoutes = require("./routes/v1/branch.routes.js");
// const supplierRoutes = require("./routes/v1/supplier.routes.js");
// const productRoutes = require("./routes/v1/product.routes.js");
// const customerRoutes = require("./routes/v1/customer.routes.js");
// const customerAnalytics = require("./routes/v1/customer.analytics.routes.js");
// const paymentRoutes = require("./routes/v1/payment.routes.js");
// const userRoutes = require("./routes/v1/user.routes.js");
// const invoicePDFRoutes = require("./routes/v1/invoicePDF.routes.js");
// const notificationRoutes = require("./routes/v1/notification.routes.js");
// const invoiceRoutes = require("./routes/v1/invoice.routes.js");
// const roleRoutes = require("./routes/v1/roles.routes.js");
// const noteRoutes = require("./routes/v1/note.routes.js");
// const masterListRoutes = require("./routes/v1/masterList.routes.js");
// const transactionRouter = require("./routes/v1/transaction.routes.js");
// const partyTransactionRouter = require("./routes/v1/partyTransaction.routes.js");
// const adminRouter = require("./routes/v1/admin.routes.js");
// const emiRoutes = require("./routes/v1/emi.routes.js");
// const statementsRouter = require("./routes/v1/statements.routes.js");
// const masterRoutes = require("./routes/v1/master.routes.js");
// const masterTypeRoutes = require("./routes/v1/masterType.routes.js");
// const ledgersRoutes = require("./routes/v1/ledger.routes.js");
// const dashboard = require("./routes/v1/dashboard.routes.js");
// const salesRoutes = require("./routes/v1/sales.routes.js");
// const logRoutes = require("./routes/v1/log.routes.js");
// const aiAgent = require("./routes/v1/aiAgent.routes.js");
// const purchaseRoutes = require("./routes/v1/purchase.routes.js");
// const analyticsRoutes = require("./routes/v1/analytics.routes.js");
// const sessionRoutes = require("./routes/v1/session.routes.js");
// const chatRoutes = require("./routes/v1/chat.routes.js");
// const inventoryRoutes = require("./routes/v1/inventory.routes.js");
// const feedRoutes = require("./routes/v1/feed.routes.js");
// const chartRoutes = require("./routes/v1/chart.routes.js");
// const cronRoutes = require('./routes/v1/cron.routes.js');
// // --- CHANGED: Split the imports to mount them correctly ---
// const storefrontPublicRoutes = require('./PublicModules/routes/storefront/public.routes.js');
// const storefrontAdminRoutes = require('./PublicModules/routes/storefront/admin.routes.js');
// const smartRuleRoutes = require('./PublicModules/routes/storefront/smartRule.routes.js');
// const dropdownRoutes = require('./modules/master/core/dropdownlist');

// const app = express();
// // import registerRoutes from './routes/routeRegistry.js';
// // registerRoutes(app);
// app.set("trust proxy", 1);
// app.set("query parser", (str) => qs.parse(str, { defaultCharset: "utf-8" }));
// app.use(assignRequestId);
// app.use(
//   cors({
//     origin: process.env.CORS_ORIGIN
//       ? process.env.CORS_ORIGIN.split(",")
//       : ["http://localhost:4200", "https://apex-infinity.vercel.app", "https://apex-infinity-vert.vercel.app"],
//     credentials: true,
//     allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
//     methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
//   }),
// );
// app.options("*", cors());
// app.use((req, res, next) => {
//   if (req.method === "OPTIONS") return res.sendStatus(204);
//   next();
// });
// app.use(helmet());
// app.use(cookieParser());
// app.use(express.json({ limit: "10mb" }));
// app.use(mongoSanitize());
// app.use(xss());
// app.use(hpp());
// app.use(compression());
// morgan.token("id", (req) => req.id);
// if (process.env.NODE_ENV === "development") {
//   app.use(morgan(":id :method :url :status :response-time ms"));
// } else {
//   app.use(
//     morgan(
//       ':id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length]',
//       {
//         stream: { write: (msg) => logger.info(msg.trim()) },
//       },
//     ),
//   );
// }

// // ---------------------- RATE LIMITING FOR PUBLIC ----------------------
// app.use(
//   '/public',
//   rateLimit({
//     windowMs: 15 * 60 * 1000,
//     limit: 500,
//   })
//   // REMOVED route mounting here to do it cleaner below
// );

// // F. Session Activity
// app.use(updateSessionActivity);

// // G. Rate Limiting for API
// app.use(
//   "/api/v1",
//   rateLimit({
//     limit: 2000,
//     windowMs: 60 * 60 * 1000,
//     standardHeaders: true,
//     legacyHeaders: false,
//     message: "Too many requests, please try again later.",
//   }),
// );

// // ---------------------- 3. HEALTH CHECK ----------------------
// // --- ADD THIS BLOCK ---
// app.get("/", (req, res) => {
//   res.status(200).json({
//     status: "success",
//     message: "Apex Infinity API is live",
//     environment: process.env.NODE_ENV
//   });
// });


// app.get("/health", (req, res) => {
//   const dbStatus = mongoose.connection.readyState;
//   const statusMap = {
//     0: "DISCONNECTED",
//     1: "CONNECTED",
//     2: "CONNECTING",
//     3: "DISCONNECTING",
//   };

//   const isHealthy = dbStatus === 1;

//   const response = {
//     status: isHealthy ? "UP" : "DEGRADED",
//     timestamp: new Date().toISOString(),
//     services: {
//       database: statusMap[dbStatus] || "UNKNOWN",
//       server: "RUNNING",
//     },
//     uptime: process.uptime(),
//     requestId: req.id,
//   };

//   res.status(isHealthy ? 200 : 503).json(response);
// });

// // ---------------------- 4. MOUNT ROUTES ----------------------

// app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// // === NEW STOREFRONT ROUTE MOUNTING ===

// // 1. Public Storefront Routes (matches Angular Public Service)
// app.use('/api/v1/store', storefrontPublicRoutes);
// app.use('/api/v1/admin/storefront/smart-rules', smartRuleRoutes);
// app.use('/api/v1/admin/storefront', storefrontAdminRoutes);
// // === EXISTING API ROUTES ===
// app.use("/api/v1/organization", organizationRoutes);
// app.use("/api/v1/neworganization", organizationExtrasRoutes);
// app.use("/api/v1/auth", authRoutes);
// app.use("/api/v1/users", userRoutes);
// app.use("/api/v1/roles", roleRoutes);
// app.use("/api/v1/branches", branchRoutes);
// app.use("/api/v1/products", productRoutes);
// app.use("/api/v1/customers", customerRoutes);
// app.use("/api/v1/suppliers", supplierRoutes);
// app.use("/api/v1/dropdowns", dropdownRoutes);

// app.use("/api/v1/invoices", invoiceRoutes);
// app.use("/api/v1/invoices/pdf", invoicePDFRoutes);
// app.use("/api/v1/payments", paymentRoutes);
// app.use("/api/v1/sales", salesRoutes);
// app.use("/api/v1/purchases", purchaseRoutes);
// app.use("/api/v1/emi", emiRoutes);
// app.use("/api/v1/transactions", transactionRouter);
// app.use("/api/v1/partytransactions", partyTransactionRouter);
// app.use("/api/v1/ledgers", ledgersRoutes);
// app.use("/api/v1/statements", statementsRouter);
// app.use("/api/v1/accounts", require("./routes/v1/account.routes.js"));
// app.use("/api/v1/dashboard", dashboard);
// app.use("/api/v1/analytics", analyticsRoutes);
// app.use("/api/v1/chart", chartRoutes);
// app.use("/api/v1/admin", adminRouter);
// // === HRMS ROUTES - ADD THIS SINGLE LINE ===
// app.use('/api/v1/hrms', require('./modules/HRMS/routes/index'));
// app.use("/api/v1/notifications", notificationRoutes);
// app.use("/api/v1/notes", noteRoutes);
// app.use("/api/v1/chat", chatRoutes);
// app.use("/api/v1/ai-agent", aiAgent);
// app.use("/api/v1/search", require("./routes/v1/search.routes.js"));
// app.use("/api/v1/announcements", require("./routes/v1/announcement.routes.js"));
// app.use("/api/v1/master", masterRoutes);
// app.use("/api/v1/master-list", masterListRoutes);
// app.use("/api/v1/master-types", masterTypeRoutes);
// app.use("/api/v1/logs", logRoutes);
// app.use("/api/v1/sessions", sessionRoutes);
// app.use("/api/v1/ownership", require("./routes/v1/ownership.routes.js"));
// app.use("/api/v1/inventory", inventoryRoutes);
// app.use("/api/v1/feed", feedRoutes);
// app.use("/api/v1/reconciliation", require("./routes/v1/reconciliation.routes.js"));
// app.use("/api/v1/automation", require("./routes/v1/automation.routes.js"));
// app.use("/api/v1/assets", require("./routes/v1/asset.routes.js"));
// // app.use("/api/v1/shifts", shiftRoutes);
// // app.use("/api/v1/holidays", holidayRoutes);
// app.use('/api/v1/stock', require('./routes/v1/stock.routes.js'));
// // app.use("/api/v1/attendance", attendanceRoutes);
// app.use('/api/v1/cron', cronRoutes);
// app.use('/api/v1/customeranalytics', customerAnalytics);

// app.use((req, res, next) => {
//   next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
// });

// app.use((err, req, res, next) => {
//   logger.error(err.message || "Unhandled error", {
//     requestId: req.id,
//     stack: err.stack,
//     path: req.originalUrl,
//     method: req.method,
//     user: req.user?._id,
//   });

//   globalErrorHandler(err, req, res, next);
// });

// module.exports = app;



// // const qs = require("qs");
// // const express = require("express");
// // const morgan = require("morgan");
// // const rateLimit = require("express-rate-limit");
// // const helmet = require("helmet");
// // const mongoSanitize = require("express-mongo-sanitize");
// // const xss = require("xss-clean");
// // const hpp = require("hpp");
// // const cors = require("cors");
// // const compression = require("compression");
// // const cookieParser = require("cookie-parser");
// // const mongoose = require("mongoose");
// // const swaggerUi = require("swagger-ui-express");
// // const swaggerSpec = require("./bootstrap/swagger");
// // const globalErrorHandler = require("./core/error/errorController");
// // const AppError = require("./core/utils/api/appError");
// // const logger = require("./bootstrap/logger");
// // const { updateSessionActivity } = require("./core/middleware/session.middleware");
// // const assignRequestId = require("./core/middleware/requestId");
// // const registerRoutes = require("./routes/routeRegistrynew.js");

// // const app = express();

// // app.set("trust proxy", 1);
// // app.set("query parser", (str) => qs.parse(str, { defaultCharset: "utf-8" }));
// // app.use(assignRequestId);
// // app.use(
// //   cors({
// //     origin: process.env.CORS_ORIGIN
// //       ? process.env.CORS_ORIGIN.split(",")
// //       : ["http://localhost:4200", "https://apex-infinity.vercel.app", "https://apex-infinity-vert.vercel.app"],
// //     credentials: true,
// //     allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
// //     methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
// //   }),
// // );
// // app.options("*", cors());
// // app.use((req, res, next) => {
// //   if (req.method === "OPTIONS") return res.sendStatus(204);
// //   next();
// // });
// // app.use(helmet());
// // app.use(cookieParser());
// // app.use(express.json({ limit: "10mb" }));
// // app.use(mongoSanitize());
// // app.use(xss());
// // app.use(hpp());
// // app.use(compression());
// // morgan.token("id", (req) => req.id);
// // if (process.env.NODE_ENV === "development") {
// //   app.use(morgan(":id :method :url :status :response-time ms"));
// // } else {
// //   app.use(
// //     morgan(
// //       ':id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length]',
// //       {
// //         stream: { write: (msg) => logger.info(msg.trim()) },
// //       },
// //     ),
// //   );
// // }

// // // ---------------------- RATE LIMITING FOR PUBLIC ----------------------
// // app.use(
// //   '/public',
// //   rateLimit({
// //     windowMs: 15 * 60 * 1000,
// //     limit: 500,
// //   })
// // );

// // // F. Session Activity
// // app.use(updateSessionActivity);

// // // G. Rate Limiting for API
// // app.use(
// //   "/api/v1",
// //   rateLimit({
// //     limit: 2000,
// //     windowMs: 60 * 60 * 1000,
// //     standardHeaders: true,
// //     legacyHeaders: false,
// //     message: "Too many requests, please try again later.",
// //   }),
// // );

// // // ---------------------- 3. HEALTH CHECK ----------------------
// // app.get("/", (req, res) => {
// //   res.status(200).json({
// //     status: "success",
// //     message: "Apex Infinity API is live",
// //     environment: process.env.NODE_ENV
// //   });
// // });


// // app.get("/health", (req, res) => {
// //   const dbStatus = mongoose.connection.readyState;
// //   const statusMap = {
// //     0: "DISCONNECTED",
// //     1: "CONNECTED",
// //     2: "CONNECTING",
// //     3: "DISCONNECTING",
// //   };

// //   const isHealthy = dbStatus === 1;

// //   const response = {
// //     status: isHealthy ? "UP" : "DEGRADED",
// //     timestamp: new Date().toISOString(),
// //     services: {
// //       database: statusMap[dbStatus] || "UNKNOWN",
// //       server: "RUNNING",
// //     },
// //     uptime: process.uptime(),
// //     requestId: req.id,
// //   };

// //   res.status(isHealthy ? 200 : 503).json(response);
// // });

// // // ---------------------- 4. MOUNT ROUTES ----------------------

// // app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// // registerRoutes(app);

// // app.use((req, res, next) => {
// //   next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
// // });

// // app.use((err, req, res, next) => {
// //   logger.error(err.message || "Unhandled error", {
// //     requestId: req.id,
// //     stack: err.stack,
// //     path: req.originalUrl,
// //     method: req.method,
// //     user: req.user?._id,
// //   });

// //   globalErrorHandler(err, req, res, next);
// // });

// // module.exports = app;


