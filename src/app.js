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
const AppError = require("./core/utils/appError");
const logger = require("./bootstrap/logger");
const { updateSessionActivity } = require("./core/middleware/session.middleware");
const assignRequestId = require("./shared/middleware/requestId");

// ---------------------- ROUTES ----------------------
const organizationRoutes = require("./routes/v1/organizationRoutes");
const organizationExtrasRoutes = require("./routes/v1/organizationExtrasRoutes");
const authRoutes = require("./routes/v1/authRoutes");
const branchRoutes = require("./routes/v1/branchRoutes");
const supplierRoutes = require("./routes/v1/supplierRoutes");
const productRoutes = require("./routes/v1/productRoutes");
const customerRoutes = require("./routes/v1/customerRoutes");
const customerAnalytics = require("./routes/v1/customer.analytics.routes");
const paymentRoutes = require("./routes/v1/paymentRoutes");
const userRoutes = require("./routes/v1/userRoutes");
const invoicePDFRoutes = require("./routes/v1/invoicePDFRoutes");
const notificationRoutes = require("./routes/v1/notificationRoutes");
const invoiceRoutes = require("./routes/v1/invoiceRoutes");
const roleRoutes = require("./routes/v1/rolesRoutes");
const noteRoutes = require("./routes/v1/noteRoutes");
const masterListRoutes = require("./routes/v1/masterListRoutes");
const transactionRouter = require("./routes/v1/transactionRoutes");
const partyTransactionRouter = require("./routes/v1/partyTransactionRoutes");
const adminRouter = require("./routes/v1/adminRoutes");
const emiRoutes = require("./routes/v1/emiRoutes");
const statementsRouter = require("./routes/v1/statementsRoutes");
const masterRoutes = require("./routes/v1/masterRoutes");
const masterTypeRoutes = require("./routes/v1/masterTypeRoutes");
const ledgersRoutes = require("./routes/v1/ledgerRoutes");
const dashboard = require("./routes/v1/dashboardRoutes");
const salesRoutes = require("./routes/v1/salesRoutes");
const logRoutes = require("./routes/v1/logRoutes");
const aiAgent = require("./routes/v1/AiAgentRoutes");
const purchaseRoutes = require("./routes/v1/purchaseRoutes");
const analyticsRoutes = require("./routes/v1/analyticsRoutes");
const sessionRoutes = require("./routes/v1/sessionRoutes");
const chatRoutes = require("./routes/v1/chatRoutes");
const inventoryRoutes = require("./routes/v1/inventoryRoutes");
const feedRoutes = require("./routes/v1/feedRoutes");
const chartRoutes = require("./routes/v1/chartRoutes");
const attendanceRoutes = require("./routes/v1/attendanceRoutes");
const shiftRoutes = require("./routes/v1/shiftRoutes");
const holidayRoutes = require("./routes/v1/holidayRoutes");
const cronRoutes = require('./routes/v1/cron.routes');

// --- CHANGED: Split the imports to mount them correctly ---
const storefrontPublicRoutes = require('./PublicModules/routes/storefront/public.routes');
const storefrontAdminRoutes = require('./PublicModules/routes/storefront/admin.routes');
const smartRuleRoutes = require('./PublicModules/routes/storefront/smartRule.routes');

const app = express();

app.set("trust proxy", 1);
app.set("query parser", (str) => qs.parse(str, { defaultCharset: "utf-8" }));
app.use(assignRequestId);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : ["http://localhost:4200", "https://apex-infinity.vercel.app"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"], 
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);
app.options("*", cors());
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

// === NEW STOREFRONT ROUTE MOUNTING ===

// 1. Public Storefront Routes (matches Angular Public Service)
app.use('/public', storefrontPublicRoutes);

app.use('/api/v1/admin/storefront/smart-rules', smartRuleRoutes);
app.use('/api/v1/admin/storefront', storefrontAdminRoutes);
// === EXISTING API ROUTES ===
app.use("/api/v1/organization", organizationRoutes);
app.use("/api/v1/neworganization", organizationExtrasRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/branches", branchRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/suppliers", supplierRoutes);

app.use("/api/v1/invoices", invoiceRoutes);
app.use("/api/v1/invoices/pdf", invoicePDFRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/sales", salesRoutes);
app.use("/api/v1/purchases", purchaseRoutes);
app.use("/api/v1/emi", emiRoutes);
app.use("/api/v1/transactions", transactionRouter);
app.use("/api/v1/partytransactions", partyTransactionRouter);
app.use("/api/v1/ledgers", ledgersRoutes);
app.use("/api/v1/statements", statementsRouter);
app.use("/api/v1/accounts", require("./routes/v1/accountRoutes"));

app.use("/api/v1/dashboard", dashboard);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/chart", chartRoutes);
app.use("/api/v1/admin", adminRouter);

app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/notes", noteRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/ai-agent", aiAgent);
app.use("/api/v1/search", require("./routes/v1/searchRoutes"));
app.use("/api/v1/announcements", require("./routes/v1/announcementRoutes"));

app.use("/api/v1/master", masterRoutes);
app.use("/api/v1/master-list", masterListRoutes);
app.use("/api/v1/master-types", masterTypeRoutes);
app.use("/api/v1/logs", logRoutes);
app.use("/api/v1/sessions", sessionRoutes);
app.use("/api/v1/ownership", require("./routes/v1/ownership.routes"));
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/feed", feedRoutes);
app.use("/api/v1/reconciliation", require("./routes/v1/reconciliationRoutes"));
app.use("/api/v1/automation", require("./routes/v1/automationRoutes"));
// app.use("/api/v1/shifts", shiftRoutes);
// app.use("/api/v1/holidays", holidayRoutes);
app.use('/api/v1/stock', require('./routes/v1/stockRoutes'));
// app.use("/api/v1/attendance", attendanceRoutes);
app.use('/api/v1/cron', cronRoutes);
app.use('/api/v1/customeranalytics', customerAnalytics);

// Example mounting
const structureRouter = require('./modules/HRMS/routes/structure.routes');
const shiftRouter = require('./modules/HRMS/routes/shift.routes');
const attendanceRouter = require('./modules/HRMS/routes/attendance.routes');

app.use('/api/v1/structure', structureRouter);
app.use('/api/v1/shifts', shiftRouter);
app.use('/api/v1/attendance', attendanceRouter);

app.use((req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
});

app.use((err, req, res, next) => {
  logger.error(err.message || "Unhandled error", {
    requestId: req.id,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    user: req.user?._id,
  });

  globalErrorHandler(err, req, res, next);
});

module.exports = app;


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
// const mongoose = require("mongoose"); // Required for health check

// const swaggerUi = require("swagger-ui-express");
// const swaggerSpec = require("./bootstrap/swagger");
// const globalErrorHandler = require("./core/error/errorController");
// const AppError = require("./core/utils/appError");
// const logger = require("./bootstrap/logger");
// const { updateSessionActivity } = require("./core/middleware/session.middleware");
// const assignRequestId = require("./shared/middleware/requestId");

// // ---------------------- ROUTES ----------------------
// // (Keep all your existing imports exactly as they are)
// const organizationRoutes = require("./routes/v1/organizationRoutes");
// const organizationExtrasRoutes = require("./routes/v1/organizationExtrasRoutes");
// const authRoutes = require("./routes/v1/authRoutes");
// const branchRoutes = require("./routes/v1/branchRoutes");
// const supplierRoutes = require("./routes/v1/supplierRoutes");
// const productRoutes = require("./routes/v1/productRoutes");
// const customerRoutes = require("./routes/v1/customerRoutes");
// const customerAnalytics = require("./routes/v1/customer.analytics.routes");
// const paymentRoutes = require("./routes/v1/paymentRoutes");
// const userRoutes = require("./routes/v1/userRoutes");
// const invoicePDFRoutes = require("./routes/v1/invoicePDFRoutes");
// const notificationRoutes = require("./routes/v1/notificationRoutes");
// const invoiceRoutes = require("./routes/v1/invoiceRoutes");
// const roleRoutes = require("./routes/v1/rolesRoutes");
// const noteRoutes = require("./routes/v1/noteRoutes");
// const masterListRoutes = require("./routes/v1/masterListRoutes");
// const transactionRouter = require("./routes/v1/transactionRoutes");
// const partyTransactionRouter = require("./routes/v1/partyTransactionRoutes");
// const adminRouter = require("./routes/v1/adminRoutes");
// const emiRoutes = require("./routes/v1/emiRoutes");
// const statementsRouter = require("./routes/v1/statementsRoutes");
// const masterRoutes = require("./routes/v1/masterRoutes");
// const masterTypeRoutes = require("./routes/v1/masterTypeRoutes");
// const ledgersRoutes = require("./routes/v1/ledgerRoutes");
// const dashboard = require("./routes/v1/dashboardRoutes");
// const salesRoutes = require("./routes/v1/salesRoutes");
// const logRoutes = require("./routes/v1/logRoutes");
// const aiAgent = require("./routes/v1/AiAgentRoutes");
// const purchaseRoutes = require("./routes/v1/purchaseRoutes");
// const analyticsRoutes = require("./routes/v1/analyticsRoutes");
// const sessionRoutes = require("./routes/v1/sessionRoutes");
// const chatRoutes = require("./routes/v1/chatRoutes");
// const inventoryRoutes = require("./routes/v1/inventoryRoutes");
// const feedRoutes = require("./routes/v1/feedRoutes");
// const chartRoutes = require("./routes/v1/chartRoutes");
// const attendanceRoutes = require("./routes/v1/attendanceRoutes");
// const shiftRoutes = require("./routes/v1/shiftRoutes");
// const holidayRoutes = require("./routes/v1/holidayRoutes");
// const cronRoutes = require('./routes/v1/cron.routes');
// const publicModulesRoutes = require('./PublicModules/routes/storefront/index');

// const app = express();

// app.set("trust proxy", 1);
// app.set("query parser", (str) => qs.parse(str, { defaultCharset: "utf-8" }));
// app.use(assignRequestId);
// app.use(
//   cors({
//     origin: process.env.CORS_ORIGIN
//       ? process.env.CORS_ORIGIN.split(",")
//       : ["http://localhost:4200", "https://apex-infinity.vercel.app"],
//     credentials: true,
//     allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"], // Added X-Request-Id
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
// // ---------------------- PUBLIC ROUTES ----------------------
// app.use(
//   '/public',
//   rateLimit({
//     windowMs: 15 * 60 * 1000,
//     limit: 500,
//   }),
//   publicModulesRoutes
// );

// // F. Session Activity
// app.use(updateSessionActivity);

// // G. Rate Limiting
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

// // ---------------------- 3. REAL HEALTH CHECK ----------------------
// app.get("/health", (req, res) => {
//   const dbStatus = mongoose.connection.readyState;
//   const statusMap = {
//     0: "DISCONNECTED",
//     1: "CONNECTED",
//     2: "CONNECTING",
//     3: "DISCONNECTING",
//   };

//   const isHealthy = dbStatus === 1; // Only healthy if DB is connected

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
// app.use("/api/v1/organization", organizationRoutes);
// app.use("/api/v1/neworganization", organizationExtrasRoutes);
// app.use("/api/v1/auth", authRoutes);
// app.use("/api/v1/users", userRoutes);
// app.use("/api/v1/roles", roleRoutes);
// // Business Routes
// app.use("/api/v1/branches", branchRoutes);
// app.use("/api/v1/products", productRoutes);
// app.use("/api/v1/customers", customerRoutes);
// app.use("/api/v1/suppliers", supplierRoutes);

// // Finance Routes
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
// app.use("/api/v1/accounts", require("./routes/v1/accountRoutes"));

// // Reporting & Dashboard
// app.use("/api/v1/dashboard", dashboard);
// app.use("/api/v1/analytics", analyticsRoutes);
// app.use("/api/v1/chart", chartRoutes);
// app.use("/api/v1/admin", adminRouter);

// // Communication & Tools
// app.use("/api/v1/notifications", notificationRoutes);
// app.use("/api/v1/notes", noteRoutes);
// app.use("/api/v1/chat", chatRoutes);
// app.use("/api/v1/ai-agent", aiAgent);
// app.use("/api/v1/search", require("./routes/v1/searchRoutes"));
// app.use("/api/v1/announcements", require("./routes/v1/announcementRoutes"));

// // System
// app.use("/api/v1/master", masterRoutes);
// app.use("/api/v1/master-list", masterListRoutes);
// app.use("/api/v1/master-types", masterTypeRoutes);
// app.use("/api/v1/logs", logRoutes);
// app.use("/api/v1/sessions", sessionRoutes);
// app.use("/api/v1/ownership", require("./routes/v1/ownership.routes"));
// app.use("/api/v1/inventory", inventoryRoutes);
// app.use("/api/v1/feed", feedRoutes);
// app.use("/api/v1/reconciliation", require("./routes/v1/reconciliationRoutes"));
// app.use("/api/v1/automation", require("./routes/v1/automationRoutes"));
// app.use("/api/v1/shifts", shiftRoutes);
// app.use("/api/v1/holidays", holidayRoutes);
// app.use('/api/v1/stock', require('./routes/v1/stockRoutes'));
// app.use("/api/v1/attendance", attendanceRoutes);
// app.use('/api/v1/cron', cronRoutes);
// app.use('/api/v1/customeranalytics', customerAnalytics);

// app.use((req, res, next) => {
//   next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
// });

// app.use((err, req, res, next) => {
//   // Enhanced logging with Request ID
//   logger.error(err.message || "Unhandled error", {
//     requestId: req.id, // Traceability
//     stack: err.stack,
//     path: req.originalUrl,
//     method: req.method,
//     user: req.user?._id,
//   });

//   globalErrorHandler(err, req, res, next);
// });

// module.exports = app;



// // /**// app.js - Working version with all improvements
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
// // const swaggerSpec = require("./config/swaggerConfig");
// // const globalErrorHandler = require("./middleware/errorController");
// // const AppError = require("./utils/appError");
// // const logger = require("./config/logger");
// // const { updateSessionActivity } = require("./middleware/sessionActivity");
// // const assignRequestId = require("./middleware/assignRequestId");

// // // Import route manager
// // const routeManager = require("./middleware/routeManager");

// // const app = express();

// // // ====================== 1. GLOBAL SETTINGS ======================
// // app.set("trust proxy", 1);
// // app.set("query parser", (str) => qs.parse(str, { defaultCharset: "utf-8" }));

// // // ====================== 2. MIDDLEWARE CHAIN ======================

// // // A. Request ID (First, so logs can use it)
// // app.use(assignRequestId);

// // // B. CORS
// // app.use(
// //   cors({
// //     origin: process.env.CORS_ORIGIN
// //       ? process.env.CORS_ORIGIN.split(",")
// //       : ["http://localhost:4200", "https://apex-infinity.vercel.app"],
// //     credentials: true,
// //     allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
// //     methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
// //   }),
// // );
// // app.options("*", cors());

// // // C. Preflight Auth Bypass
// // app.use((req, res, next) => {
// //   if (req.method === "OPTIONS") return res.sendStatus(204);
// //   next();
// // });

// // // D. Security & Parsers
// // app.use(helmet());
// // app.use(cookieParser());
// // app.use(express.json({ limit: "10mb" }));
// // app.use(mongoSanitize());
// // app.use(xss());
// // app.use(hpp());
// // app.use(compression());

// // // E. Setup Morgan Token
// // morgan.token("id", (req) => req.id || "-");

// // // F. Logging (Enhanced with ID)
// // if (process.env.NODE_ENV === "development") {
// //   app.use(morgan(":id :method :url :status :response-time ms"));
// // } else {
// //   app.use(
// //     morgan(
// //       ':id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length]',
// //       {
// //         stream: { write: (msg) => logger.info(msg.trim()) },
// //       }
// //     )
// //   );
// // }

// // // G. Session Activity
// // app.use(updateSessionActivity);

// // // H. Rate Limiting
// // app.use(
// //   "/api/v1",
// //   rateLimit({
// //     limit: 2000,
// //     windowMs: 60 * 60 * 1000,
// //     standardHeaders: true,
// //     legacyHeaders: false,
// //     message: "Too many requests, please try again later.",
// //   })
// // );

// // // ====================== 3. ROUTE MANAGEMENT ======================

// // // API Documentation
// // app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// // // Route information middleware
// // app.use(routeManager.routeInfoMiddleware);

// // // Load all routes
// // const loadedRoutes = routeManager.initialize(app);

// // // Route information endpoint
// // app.get("/api/v1/routes/info", routeManager.getRouteInfo);

// // // ====================== 4. HEALTH CHECK ======================
// // app.get("/health", (req, res) => {
// //   const dbStatus = mongoose.connection.readyState;
// //   const statusMap = {
// //     0: "DISCONNECTED",
// //     1: "CONNECTED",
// //     2: "CONNECTING",
// //     3: "DISCONNECTING",
// //   };

// //   const dbHealthy = dbStatus === 1;
// //   const routesHealthy = routeManager.getRouteLoader()?.allRoutesLoaded() ?? false;
// //   const isHealthy = dbHealthy && routesHealthy;

// //   const response = {
// //     status: isHealthy ? "UP" : "DEGRADED",
// //     timestamp: new Date().toISOString(),
// //     requestId: req.id,
// //     services: {
// //       database: {
// //         status: statusMap[dbStatus] || "UNKNOWN",
// //         healthy: dbHealthy,
// //       },
// //       routes: {
// //         status: routesHealthy ? "LOADED" : "ERROR",
// //         healthy: routesHealthy,
// //         loaded: Array.from(loadedRoutes.values())
// //           .filter(r => r.status === "loaded").length,
// //         total: loadedRoutes.size,
// //       },
// //       server: {
// //         status: "RUNNING",
// //         healthy: true,
// //         uptime: process.uptime(),
// //       },
// //     },
// //     environment: process.env.NODE_ENV,
// //   };

// //   res.status(isHealthy ? 200 : 503).json(response);
// // });

// // // ====================== 5. ERROR HANDLING ======================

// // // 404 Handler
// // app.use((req, res, next) => {
// //   next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
// // });

// // // Global Error Handler
// // app.use((err, req, res, next) => {
// //   logger.error("Unhandled error", {
// //     requestId: req.id,
// //     error: err.message,
// //     stack: err.stack,
// //     path: req.originalUrl,
// //     method: req.method,
// //     user: req.user?._id,
// //     ip: req.ip,
// //   });

// //   globalErrorHandler(err, req, res, next);
// // });

// // module.exports = app; */
