require("dotenv").config({ path: `${__dirname}/.env` });
const mongoose = require("mongoose");
const http = require("http");
const app = require("./app");
const socketUtil = require("./utils/socket"); // ✅ Uses the utility we verified

const PORT = process.env.PORT || 5000;
const DB_URI = process.env.DATABASE;

// --- 1. Validation ---
if (!DB_URI) {
  console.error("❌ FATAL: Missing DATABASE connection string in .env");
  process.exit(1);
}

let server;
let io;

// --- 2. Database & Server Start ---
async function startServer() {
  try {
    // A. Connect to MongoDB
    await mongoose.connect(DB_URI, {
      autoIndex: process.env.NODE_ENV !== "production",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000 // Fail fast if DB is down
    });
    console.log(`✅ MongoDB connected (${process.env.NODE_ENV})`);

    // B. Create HTTP Server
    server = http.createServer(app);

    // C. Initialize Socket.IO
    io = socketUtil.init(server, {
      cors: {
        origin: process.env.CORS_ORIGIN
          ? process.env.CORS_ORIGIN.split(",")
          : ["http://localhost:4200", "https://apex-infinity.vercel.app"],
        methods: ["GET", "POST"],
        credentials: true,
      }
    });
    console.log("✅ Socket.IO initialized");

    // D. Start Listening
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      
      // E. Start Background Jobs (Only after server is up)
      try {
        require("./utils/cron"); // This file now loads all jobs
        console.log("⏰ Background Cron Jobs active");
      } catch (e) {
        console.error("⚠️ Cron Job Error:", e.message);
      }
    });

  } catch (err) {
    console.error("💥 Startup Error:", err.message);
    process.exit(1);
  }
}

// --- 3. Graceful Shutdown ---
async function shutdown(signal) {
  console.log(`\n👋 ${signal} received. Closing resources...`);
  
  if (server) {
    server.close(() => console.log("   - HTTP Server closed"));
  }
  
  if (io) {
    io.close(() => console.log("   - Socket.IO closed"));
  }

  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close(false);
    console.log("   - MongoDB connection closed");
  }

  console.log("✅ Shutdown complete.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  console.error("💥 Unhandled Rejection:", err.message);
  shutdown("UNHANDLED_REJECTION");
});

startServer();
// // src/server.js
// require("dotenv").config({ path: `${__dirname}/.env` });
// const mongoose = require("mongoose");
// const http = require("http");
// const app = require("./app");
// const socketUtil = require("./utils/socket"); // <--- IMPORT YOUR UTILITY

// const PORT = process.env.PORT || 5000;
// const DB_URI = process.env.DATABASE;

// // --- 🧠 Validate environment ---
// if (!DB_URI) {
//   console.error("❌ Missing DATABASE connection string in .env file");
//   process.exit(1);
// }

// let server;

// // =====================================================
// // 1️⃣ DATABASE CONNECTION
// // =====================================================
// async function connectDB() {
//   try {
//     await mongoose.connect(DB_URI, {
//       autoIndex: process.env.NODE_ENV !== "production",
//       maxPoolSize: 10,
//     });
//     console.log(`✅ MongoDB connected successfully (${process.env.NODE_ENV})`);
//   } catch (err) {
//     console.error("💥 MongoDB connection failed:", err.message);
//     process.exit(1);
//   }
// }

// // =====================================================
// // 2️⃣ START SERVER + SOCKET.IO
// // =====================================================
// async function startServer() {
//   try {
//     await connectDB();

//     // --- Create HTTP Server ---
//     server = http.createServer(app);

//     // --- Initialize Socket.IO via Utility ---
//     // This activates the logic in src/utils/socket.js
//     const io = socketUtil.init(server, {
//       cors: {
//         origin: process.env.CORS_ORIGIN
//           ? process.env.CORS_ORIGIN.split(",")
//           : ["http://localhost:4200"],
//         methods: ["GET", "POST"],
//         credentials: true,
//       },
//       jwtSecret: process.env.JWT_SECRET
//     });

//     console.log("✅ Socket.IO Initialized via Utility");

//     // Optional: Make IO accessible in request object if needed for legacy code
//     app.set("io", io);

//     // =====================================================
//     // 3️⃣ START EXPRESS APP
//     // =====================================================
//     server.listen(PORT, () => {
//       console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
//       try {
//         console.log("🕒 Initializing background cron jobs...");
//         require("./utils/cron");
//         console.log("✅ Cron jobs initialized successfully!");
//       } catch (cronErr) {
//         console.error("⚠️ Cron initialization failed:", cronErr.message);
//       }
//     });
//   } catch (err) {
//     console.error("💥 Server startup failed:", err.message);
//     process.exit(1);
//   }
// }

// // =====================================================
// // 4️⃣ GRACEFUL SHUTDOWN
// // =====================================================
// async function shutdown(exitCode = 0) {
//   try {
//     console.log("👋 Initiating graceful shutdown...");

//     if (server) {
//       await new Promise((resolve) => server.close(resolve));
//       console.log("✅ HTTP server closed.");
//     }

//     if (mongoose.connection.readyState === 1) {
//       await mongoose.connection.close(false);
//       console.log("✅ MongoDB connection closed.");
//     }

//     console.log("🧹 Cleanup complete. Exiting now...");
//   } catch (err) {
//     console.error("💥 Error during shutdown:", err);
//   } finally {
//     process.exit(exitCode);
//   }
// }

// // =====================================================
// // 5️⃣ GLOBAL ERROR HANDLERS
// // =====================================================
// const handleFatalError = (type) => (err) => {
//   console.error(`💥 ${type} detected!`);
//   console.error(err.stack || err);
//   shutdown(1);
// };

// process.on("unhandledRejection", handleFatalError("UNHANDLED REJECTION"));
// process.on("uncaughtException", handleFatalError("UNCAUGHT EXCEPTION"));
// process.on("SIGINT", () => shutdown(0));
// process.on("SIGTERM", () => shutdown(0));

// // =====================================================
// // 6️⃣ BOOTSTRAP
// // =====================================================
// startServer();




// // // src/server.js
// // require("dotenv").config({ path: `${__dirname}/.env` });
// // const mongoose = require("mongoose");
// // const http = require("http");
// // const { Server } = require("socket.io");
// // const app = require("./app");
// // const PORT = process.env.PORT || 5000;
// // const DB_URI = process.env.DATABASE;
// // if (!DB_URI) {
// //   console.error("❌ Missing DATABASE connection string in .env file");
// //   process.exit(1);
// // }

// // let server;
// // let io;
// // const activeUsers = new Map();

// // // =====================================================
// // // 1️⃣ DATABASE CONNECTION
// // // =====================================================
// // async function connectDB() {
// //   try {
// //     await mongoose.connect(DB_URI, {
// //       autoIndex: process.env.NODE_ENV !== "production",
// //       maxPoolSize: 10,
// //     });
// //     console.log(`✅ MongoDB connected successfully (${process.env.NODE_ENV})`);
// //   } catch (err) {
// //     console.error("💥 MongoDB connection failed:", err.message);
// //     process.exit(1);
// //   }
// // }

// // // =====================================================
// // // 2️⃣ START SERVER + SOCKET.IO
// // // =====================================================
// // async function startServer() {
// //   try {
// //     await connectDB();
// //     server = http.createServer(app);
// //     io = new Server(server, {
// //       cors: {
// //         origin: process.env.CORS_ORIGIN
// //           ? process.env.CORS_ORIGIN.split(",")
// //           : ["http://localhost:4200"],
// //         methods: ["GET", "POST"],
// //         credentials: true,
// //       },
// //       transports: ["websocket", "polling"],
// //     });
// //     console.log("🧩 Socket.IO CORS origins:", process.env.CORS_ORIGIN);
// //     app.set("io", io);
// //     io.on("connection", (socket) => {
// //       console.log(`⚡ Client connected: ${socket.id}`);
// //       socket.on("registerUser", (userId) => {
// //         if (!userId) return;
// //         activeUsers.set(userId, socket.id);
// //         socket.join(userId);
// //         console.log(`🟢 User ${userId} registered (socket ${socket.id})`);
// //       });
// //       socket.on("disconnect", () => {
// //         for (const [userId, id] of activeUsers.entries()) {
// //           if (id === socket.id) {
// //             activeUsers.delete(userId);
// //             console.log(`🔴 User ${userId} disconnected`);
// //             break;
// //           }
// //         }
// //       });
// //     });
// //     // =====================================================
// //     // 3️⃣ START EXPRESS APP
// //     // =====================================================
// //     server.listen(PORT, () => {
// //       console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
// //       try {
// //         console.log("🕒 Initializing background cron jobs...");
// //         require("./utils/cron");
// //         console.log("✅ Cron jobs initialized successfully!");
// //       } catch (cronErr) {
// //         console.error("⚠️ Cron initialization failed:", cronErr.message);
// //       }
// //     });
// //   } catch (err) {
// //     console.error("💥 Server startup failed:", err.message);
// //     process.exit(1);
// //   }
// // }

// // // =====================================================
// // // 4️⃣ GRACEFUL SHUTDOWN
// // // =====================================================
// // async function shutdown(exitCode = 0) {
// //   try {
// //     console.log("👋 Initiating graceful shutdown...");

// //     if (server) {
// //       await new Promise((resolve) => server.close(resolve));
// //       console.log("✅ HTTP server closed.");
// //     }

// //     if (mongoose.connection.readyState === 1) {
// //       await mongoose.connection.close(false);
// //       console.log("✅ MongoDB connection closed.");
// //     }
// //     console.log("🧹 Cleanup complete. Exiting now...");
// //   } catch (err) {
// //     console.error("💥 Error during shutdown:", err);
// //   } finally {
// //     process.exit(exitCode);
// //   }
// // }

// // // =====================================================
// // // 5️⃣ GLOBAL ERROR HANDLERS
// // // =====================================================
// // const handleFatalError = (type) => (err) => {
// //   console.error(`💥 ${type} detected!`);
// //   console.error(err.stack || err);
// //   shutdown(1);
// // };

// // process.on("unhandledRejection", handleFatalError("UNHANDLED REJECTION"));
// // process.on("uncaughtException", handleFatalError("UNCAUGHT EXCEPTION"));
// // process.on("SIGINT", () => shutdown(0));
// // process.on("SIGTERM", () => shutdown(0));

// // // =====================================================
// // // 6️⃣ BOOTSTRAP
// // // =====================================================
// // startServer();
