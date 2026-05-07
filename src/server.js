// src/server.js
require("dotenv").config({ path: `${__dirname}/.env` });
const mongoose = require("mongoose");
const http = require("http");
const app = require("./app");
const socketUtil = require("./socketHandlers/socket");

const PORT = process.env.PORT || 5000;
const DB_URI = process.env.DATABASE;

// --- 🧠 Validate environment ---
if (!DB_URI) {
  console.error("❌ Missing DATABASE connection string in .env file");
  process.exit(1);
}

let server;

// =====================================================
// 1️⃣ DATABASE CONNECTION
// =====================================================
async function connectDB() {
  try {
    await mongoose.connect(DB_URI, {
      autoIndex: process.env.NODE_ENV !== "production",
      maxPoolSize: 10,
    });
    console.log(`✅ MongoDB connected successfully (${process.env.NODE_ENV})`);
  } catch (err) {
    console.error("💥 MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

// =====================================================
// 2️⃣ START SERVER + SOCKET.IO
// =====================================================
async function startServer() {
  try {
    await connectDB();

    // --- Create HTTP Server ---
    server = http.createServer(app);

    // --- Initialize Socket.IO via Utility ---
    // This activates the logic in src/utils/socket.js
    // const io = socketUtil.init(server, {
    //   cors: {
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
    //     methods: ["GET", "POST"],
    //     credentials: true,
    //   },
    //   jwtSecret: process.env.JWT_SECRET
    // });

    const io = socketUtil.init(server, {
      cors: {
        origin: function (origin, callback) {
          // In development, allow all origins to accommodate dynamic local IPs
          if (process.env.NODE_ENV === "development" || !origin) {
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

          // Allow Expo Go or whitelisted origins
          const isAllowed = allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('exp://');

          if (isAllowed) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        methods: ["GET", "POST"],
        credentials: true,
      },
      jwtSecret: process.env.JWT_SECRET
    });

    console.log("✅ Socket.IO Initialized via Utility");

    // Optional: Make IO accessible in request object if needed for legacy code
    app.set("io", io);

    // =====================================================
    // 3️⃣ START EXPRESS APP
    // =====================================================
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
      try {
        console.log("🕒 Initializing background cron jobs...");
        require("./core/jobs/cron");
        console.log("✅ Cron jobs initialized successfully!");
      } catch (cronErr) {
        console.error("⚠️ Cron initialization failed:", cronErr.message);
      }
    });
  } catch (err) {
    console.error("💥 Server startup failed:", err.message);
    process.exit(1);
  }
}

// =====================================================
// 4️⃣ GRACEFUL SHUTDOWN
// =====================================================
async function shutdown(exitCode = 0) {
  try {
    console.log("👋 Initiating graceful shutdown...");

    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log("✅ HTTP server closed.");
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close(false);
      console.log("✅ MongoDB connection closed.");
    }

    console.log("🧹 Cleanup complete. Exiting now...");
  } catch (err) {
    console.error("💥 Error during shutdown:", err);
  } finally {
    process.exit(exitCode);
  }
}

// =====================================================
// 5️⃣ GLOBAL ERROR HANDLERS
// =====================================================
const handleFatalError = (type) => (err) => {
  console.error(`💥 ${type} detected!`);
  console.error(err.stack || err);
  shutdown(1);
};

process.on("unhandledRejection", handleFatalError("UNHANDLED REJECTION"));
process.on("uncaughtException", handleFatalError("UNCAUGHT EXCEPTION"));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// =====================================================
// 6️⃣ BOOTSTRAP
// =====================================================
startServer();


