// src/utils/txnLogger.js
const fs = require('fs');
const path = require('path');
const logPath = path.join(__dirname, '../logs/transactions.log');

function log(message, meta = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    message,
    meta
  };

  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(logPath, line, { encoding: 'utf8' });

  // Console (only in dev)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[TXN]', message, meta);
  }
}

module.exports = { log };
