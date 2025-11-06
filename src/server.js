// src/server.js
require("dotenv").config({ path: `${__dirname}/.env` }); // Load environment variables
const path = require("path");
const mongoose = require("mongoose");
const app = require("./app");

const PORT = process.env.PORT || 4000;
const DB_URI = process.env.DATABASE;

if (!DB_URI) {
  console.error("❌ Missing DATABASE connection string in .env file");
  process.exit(1);
}

let server;

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

// --- 2️⃣ Start Server + Load Cron Jobs ---
async function startServer() {
  try {
    await connectDB();

    server = app.listen(PORT, () => {
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

// require("dotenv").config({ path: `${__dirname}/.env` }); // Load environment variables first
// const mongoose = require("mongoose");
// const app = require("./app"); // Import Express app

// // --- 2. ENVIRONMENT CONFIG ---
// const PORT = process.env.PORT || 4000;
// const DB_URI = process.env.DATABASE;

// if (!DB_URI) {
//   console.error("❌ Missing DATABASE connection string in .env file");
//   process.exit(1);
// }

// // --- 3. DATABASE CONNECTION ---
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

// // --- 4. SERVER STARTUP ---
// let server;

// async function startServer() {
//   try {
//     await connectDB();
//     server = app.listen(PORT, () => {
//       console.log(
//         `🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`,
//       );
//       console.log("🕒 Initializing background cron jobs...");
//       require("../src/utils/cron");

//       console.log("✅ All scheduled jobs initialized successfully!");
//     });
//   } catch (err) {
//     console.error("💥 Failed to start server:", err.message);
//     process.exit(1);
//   }
// }

// // --- 5. GRACEFUL SHUTDOWN ---
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

// // --- 6. ERROR HANDLERS ---
// const handleFatalError = (type) => (err) => {
//   console.error(`💥 ${type} detected!`);
//   console.error(err.stack || err);
//   shutdown(1);
// };

// process.on("unhandledRejection", handleFatalError("UNHANDLED REJECTION"));
// process.on("uncaughtException", handleFatalError("UNCAUGHT EXCEPTION"));
// process.on("SIGINT", () => shutdown(0)); // Ctrl + C
// process.on("SIGTERM", () => shutdown(0)); // For PM2 / Docker stops

// // --- 7. BOOTSTRAP ---
// startServer();
