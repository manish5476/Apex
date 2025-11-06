require("dotenv").config({ path: `${__dirname}/.env` }); // Load environment variables first
const mongoose = require("mongoose");
const app = require("./app"); // Import Express app

// --- 2. ENVIRONMENT CONFIG ---
const PORT = process.env.PORT || 4000;
const DB_URI = process.env.DATABASE;

if (!DB_URI) {
  console.error("❌ Missing DATABASE connection string in .env file");
  process.exit(1);
}

// --- 3. DATABASE CONNECTION ---
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

// --- 4. SERVER STARTUP ---
let server;

async function startServer() {
  try {
    await connectDB();
    server = app.listen(PORT, () => {
      console.log(
        `🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`,
      );
      console.log("🕒 Initializing background cron jobs...");
      require("../src/utils/cron");

      console.log("✅ All scheduled jobs initialized successfully!");
    });
  } catch (err) {
    console.error("💥 Failed to start server:", err.message);
    process.exit(1);
  }
}

// --- 5. GRACEFUL SHUTDOWN ---
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

// --- 6. ERROR HANDLERS ---
const handleFatalError = (type) => (err) => {
  console.error(`💥 ${type} detected!`);
  console.error(err.stack || err);
  shutdown(1);
};

process.on("unhandledRejection", handleFatalError("UNHANDLED REJECTION"));
process.on("uncaughtException", handleFatalError("UNCAUGHT EXCEPTION"));
process.on("SIGINT", () => shutdown(0)); // Ctrl + C
process.on("SIGTERM", () => shutdown(0)); // For PM2 / Docker stops

// --- 7. BOOTSTRAP ---
startServer();

// // src/server.js
// const mongoose = require("mongoose");

// const {
//   startPaymentReminderCron,
// } = require("./src/services/paymentReminderService");
// const {
//   startOverdueReminderCron,
// } = require("./src/services/overdueReminderService");

// // --- 1. ENVIRONMENT SETUP ---
// // This now correctly loads the .env file from *inside* the 'src' folder
// require("dotenv").config({ path: `${__dirname}/.env` });

// // We load 'app' *after* dotenv is configured
// require("dotenv").config();
// const app = require("./app");

// // TODO: Copy your 'scheduledTasks.js' file into the 'src' folder
// // const { startScheduledTasks } = require("./scheduledTasks");

// const PORT = process.env.PORT || 4000;
// const DB_URI = process.env.DATABASE;

// // --- 2. DATABASE CONNECT ---
// async function connectDB() {
//   try {
//     await mongoose.connect(DB_URI, {
//       autoIndex: process.env.NODE_ENV !== "production",
//       maxPoolSize: 10,
//     });

//     startPaymentReminderCron();
//     startOverdueReminderCron();

//     console.log(`✅ MongoDB connected (${process.env.NODE_ENV})`);
//   } catch (err) {
//     console.error("💥 Database connection failed:", err.message);
//     process.exit(1);
//   }
// }

// // --- 3. SERVER STARTUP ---
// let server;

// async function startServer() {
//   await connectDB();

//   server = app.listen(PORT, () => {
//     console.log(`🚀 Server running on port ${PORT}[${process.env.NODE_ENV}]`);
//     // startScheduledTasks(); // Uncomment when ready
//   });
// }

// // --- 4. ERROR HANDLERS ---
// const handleFatalError = (type) => (err) => {
//   console.error(`💥 ${type} detected!`);
//   console.error(err.stack || err);
//   shutdown(1); // exit with failure
// };

// process.on("unhandledRejection", handleFatalError("UNHANDLED REJECTION"));
// process.on("uncaughtException", handleFatalError("UNCAUGHT EXCEPTION"));

// // --- 5. GRACEFUL SHUTDOWN ---
// async function shutdown(exitCode = 0) {
//   try {
//     console.log("👋 Shutting down gracefully...");

//     if (server) {
//       await new Promise((resolve) => server.close(resolve));
//       console.log("✅ HTTP server closed.");
//     }

//     if (mongoose.connection.readyState === 1) {
//       await mongoose.connection.close(false);
//       console.log("✅ MongoDB connection closed.");
//     }
//   } catch (err) {
//     console.error("💥 Error during shutdown:", err);
//   } finally {
//     process.exit(exitCode);
//   }
// }

// process.on("SIGINT", () => shutdown(0)); // Ctrl+C
// process.on("SIGTERM", () => shutdown(0)); // Deployment stop

// // --- 6. BOOTSTRAP ---
// startServer();

// // // src/server.js
// // const dotenv = require('dotenv');

// // // --- IMPORTANT ---
// // // Load environment variables *before* anything else.
// // // This will load 'src/.env' by default.
// // // On your production server, these variables will already be set.
// // dotenv.config({ path: `${__dirname}/.env` });

// // const app = require('./app');
// // const connectDB = require('./config/db');

// // // Connect to Database
// // connectDB();

// // // --- START SERVER ---
// // const port = process.env.PORT || 5001; // Use port from .env or default
// // const server = app.listen(port, () => {
// //   console.log(`🚀 App running in ${process.env.NODE_ENV} mode on port ${port}...`);
// // });

// // // Handle unhandled promise rejections (e.g., bad DB password)
// // process.on('unhandledRejection', (err) => {
// //   console.error('💥 UNHANDLED REJECTION! Shutting down...');
// //   console.error(`Error: ${err.name}, ${err.message}`);
// //   server.close(() => {
// //     process.exit(1);
// //   });
// // });
