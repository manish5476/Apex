// src/server.js
require("dotenv").config({ path: `${__dirname}/.env` }); // Load environment variables
const path = require("path");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");

const PORT = process.env.PORT || 4000;
const DB_URI = process.env.DATABASE;

if (!DB_URI) {
  console.error("❌ Missing DATABASE connection string in .env file");
  process.exit(1);
}

let server;
let io; // <-- Socket.io instance
const activeUsers = new Map(); // track online users (userId → socket.id)

// --- 1️⃣ Connect to MongoDB ---
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

// --- 2️⃣ Setup HTTP Server + Socket.IO ---
async function startServer() {
  try {
    await connectDB();

    // Create HTTP server wrapping Express app
    server = http.createServer(app);

    // --- ⚡ Initialize Socket.IO ---
    // io = new Server(server, {
    //   cors: {
    //     origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
    //     credentials: true,
    //   },
    //   transports: ["websocket", "polling"],
    // });

    io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });
    console.log("🧩 Socket.IO CORS origins:", process.env.CORS_ORIGIN);

    // --- 🧠 Socket.IO Logic ---
    io.on("connection", (socket) => {
      console.log(`⚡ New client connected: ${socket.id}`);

      // Register user
      socket.on("registerUser", (userId) => {
        if (!userId) return;
        activeUsers.set(userId, socket.id);
        socket.join(userId); // Join personal room
        console.log(`🟢 User ${userId} registered with socket ${socket.id}`);
      });

      // Disconnect handler
      socket.on("disconnect", () => {
        for (const [userId, id] of activeUsers.entries()) {
          if (id === socket.id) {
            activeUsers.delete(userId);
            console.log(`🔴 User ${userId} disconnected`);
            break;
          }
        }
      });
    });

    // Make io available in all routes (attach to req)
    app.use((req, res, next) => {
      req.io = io;
      next();
    });

    // --- 🕒 Start Express Server ---
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);

      // Load all cron jobs dynamically from /utils/cron.js
      try {
        console.log("🕒 Initializing background cron jobs...");
        require("./utils/cron");
        console.log("✅ Cron jobs initialized successfully!");
      } catch (cronErr) {
        console.error("⚠️ Failed to start cron jobs:", cronErr.message);
      }
    });
  } catch (err) {
    console.error("💥 Failed to start server:", err.message);
    process.exit(1);
  }
}

// --- 3️⃣ Graceful Shutdown ---
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

// --- 4️⃣ Global Error Handlers ---
const handleFatalError = (type) => (err) => {
  console.error(`💥 ${type} detected!`);
  console.error(err.stack || err);
  shutdown(1);
};

process.on("unhandledRejection", handleFatalError("UNHANDLED REJECTION"));
process.on("uncaughtException", handleFatalError("UNCAUGHT EXCEPTION"));
process.on("SIGINT", () => shutdown(0)); // Ctrl+C
process.on("SIGTERM", () => shutdown(0)); // Cloud / Docker stop

// --- 5️⃣ Bootstrap ---
startServer();