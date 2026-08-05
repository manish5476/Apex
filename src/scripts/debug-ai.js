require("dotenv").config({ path: "./src/.env" });
const path = require('path');

console.log("1. Starting Debug...");

// Test Environment Variables
if (!process.env.GOOGLE_API_KEY) {
  console.error("❌ CRITICAL: GOOGLE_API_KEY is missing in .env file");
} else {
  console.log("✅ API Key found.");
}

// Test Models
try {
  console.log("2. Testing Model Imports...");
  // We use path.join to ensure we look in the exact right spot relative to this file
  require(path.join(__dirname, "models/salesModel")); 
  require(path.join(__dirname, "models/productModel"));
  console.log("✅ Models found.");
} catch (e) {
  console.error("❌ CRASH AT MODELS:", e.message);
  console.error("   (Check if your file is named 'salesModel.js' or 'Sales.js')");
}

// Test Packages
try {
  console.log("3. Testing AI Packages...");
  require("langchain");
  require("@langchain/google-genai");
  console.log("✅ AI Packages found.");
} catch (e) {
  console.error("❌ CRASH AT PACKAGES:", e.message);
  console.error("   (Run: npm install langchain @langchain/google-genai)");
}