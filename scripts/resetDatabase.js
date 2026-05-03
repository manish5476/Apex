const mongoose = require("mongoose");
const path = require("path");
// Try to load env from src/.env as seen in server.js
require("dotenv").config({ path: path.join(__dirname, "../src/.env") });

const DB_URI = process.env.DATABASE;

if (!DB_URI) {
  console.error("❌ Missing DATABASE connection string in src/.env file");
  process.exit(1);
}

async function resetDB() {
  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(DB_URI);
    console.log(`✅ Connected to ${mongoose.connection.name}. Clearing collections...`);
    
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      console.log(`🧹 Dropping collection: ${collection.collectionName}`);
      await collection.drop().catch(err => {
        // Ignore "ns not found" errors if collection already dropped
        if (err.codeName !== 'NamespaceNotFound') throw err;
      });
    }
    
    console.log("✨ All collections cleared successfully! You can now start fresh.");
    process.exit(0);
  } catch (err) {
    console.error("💥 Reset failed:", err.message);
    process.exit(1);
  }
}

resetDB();
