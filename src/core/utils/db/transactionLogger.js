// src/utils/txnLogger.js
const fs = require('fs');
const path = require('path');

// Ensure the directory is relative to this file
const logPath = path.join(__dirname, '../logs/transactions.log');

function log(message, meta = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    message,
    meta
  };

  const line = JSON.stringify(entry) + "\n";
  
  // --- FIX START: Create directory if it doesn't exist ---
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (err) {
      console.error('Failed to create log directory:', err);
      return; // Stop here to prevent crashing the app
    }
  }
  // --- FIX END ---

  try {
    fs.appendFileSync(logPath, line, { encoding: 'utf8' });
  } catch (err) {
    console.error('Failed to write to transaction log:', err);
  }

  // Console (only in dev)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[TXN]', message, meta);
  }
}

module.exports = { log };
