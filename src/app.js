// src/app.js
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
const path = require("path");
const fs = require("fs");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swaggerConfig");

// Error handlers & utils
const globalErrorHandler = require("./middleware/errorController");
const AppError = require("./utils/appError");
// Centralized logger (single source of truth)
const logger = require("./config/logger");

// Routes
const organizationRoutes = require("./routes/v1/organizationRoutes");
const neworganization = require("./routes/v1/organizationExtrasRoutes.js");
const authRoutes = require("./routes/v1/authRoutes");
const branchRoutes = require("./routes/v1/branchRoutes");
const supplierRoutes = require("./routes/v1/supplierRoutes");
const productRoutes = require("./routes/v1/productRoutes");
const customerRoutes = require("./routes/v1/customerRoutes");
const paymentRoutes = require("./routes/v1/paymentRoutes");
const userRoutes = require("./routes/v1/userRoutes");
const invoicePDFRoutes = require("./routes/v1/invoicePDFRoutes");
const notificationRoutes = require("./routes/v1/notificationRoutes");
const invoiceRoutes = require("./routes/v1/invoiceRoutes");
const roleRoutes = require("./routes/v1/rolesRoutes");
const noteRoutes = require("./routes/v1/noteRoutes");
const masterListRoutes = require("./routes/v1/masterListRoutes.js");
const transactionRouter = require("./routes/v1/transactionRoutes.js");
const partyTransactionRouter = require("./routes/v1/partyTransactionRoutes");
const adminRouter = require("./routes/v1/adminRoutes");
const emiRoutes = require("./routes/v1/emiRoutes");
const statementsRouter = require("./routes/v1/statementsRoutes");
const masterRoutes = require("./routes/v1/masterRoutes.js");
const masterTypeRoutes = require("./routes/v1/masterTypeRoutes.js");
const ledgersRoutes = require("./routes/v1/ledgerRoutes.js");
const dashboard = require("./routes/v1/dashboardRoutes");
const salesRoutes = require("./routes/v1/salesRoutes");
const logRoutes = require("./routes/v1/logRoutes");
const aiAgent = require("./routes/v1/AiAgentRoutes.js");

const app = express();
app.set("query parser", (str) => qs.parse(str, { defaultCharset: "utf-8" }));
app.set("trust proxy", 1);

// Ensure logs directory exists (logger may already do this; safe to re-check)
try {
  const logsDir = path.join(__dirname, "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
} catch (err) {
  // If logging creation fails, write to stdout and continue — don't crash app startup
  // logger may not be fully available yet; use console as fallback
  console.error("Failed to ensure logs directory:", err && err.message);
}

// ---------------------- SECURITY & COMMON MIDDLEWARE ----------------------
app.use(helmet());
require("./middleware/sessionActivity")
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
    credentials: true,
  })
);

// HTTP access logging: morgan -> logger
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(
    morgan("combined", {
      stream: {
        write: (msg) => {
          // trim newline added by morgan
          logger.info(msg.trim());
        },
      },
    })
  );
}

// Rate limiter for API
app.use(
  "/api/v1",
  rateLimit({
    limit: 2000,
    windowMs: 60 * 60 * 1000, // 1 hour
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests from this IP, please try again after an hour.",
  })
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
app.use(hpp());
app.use(compression());

// Small request context logger (non-blocking)
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  // Use structured log object to facilitate parsing
  logger.info("Incoming Request", {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    ts: req.requestTime,
  });
  next();
});

// ----------------------------- ROUTES -----------------------------------
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    env: process.env.NODE_ENV,
    ts: new Date().toISOString(),
  });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Register your API routers (same order as before)
app.use("/api/v1/organization", organizationRoutes);
app.use("/api/v1/neworganization", neworganization);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/branches", branchRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/suppliers", supplierRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/invoices", invoiceRoutes);
app.use("/api/v1/invoices/pdf", invoicePDFRoutes);
app.use("/api/v1/notes", noteRoutes);
app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/master-list", masterListRoutes);
app.use("/api/v1/transactions", transactionRouter);
app.use("/api/v1/partytransactions", partyTransactionRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/statements", statementsRouter);
app.use("/api/v1/master", masterRoutes);
app.use("/api/v1/master-types", masterTypeRoutes);
app.use("/api/v1/ledgers", ledgersRoutes);
app.use("/api/v1/dashboard", dashboard);
app.use("/api/v1/emi", emiRoutes);

// Logs route (admin-only route should be implemented in logRoutes)
app.use("/api/v1/logs", logRoutes);
app.use("/api/v1/sessions", require("./routes/v1/sessionRoutes"));
app.use("/api/v1/sales", salesRoutes);
app.use("/api/v1/ai-agent", aiAgent);

app.use((req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
});

// Centralized error handler (use logger inside controller)
app.use((err, req, res, next) => {
  // Log error server-side (structured)
  try {
    logger.error(err.message || "Unhandled error", {
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
      body: req.body,
      params: req.params,
      query: req.query,
    });
  } catch (logErr) {
    console.error("Logger failed:", logErr && logErr.message);
  }

  globalErrorHandler(err, req, res, next);
});

module.exports = app;
