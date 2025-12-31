const fs = require("fs");
const path = require("path");

const logFile = path.join(__dirname, "../logs/transactions.log");

module.exports.logTransaction = (type, message, meta = {}) => {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    type,
    message,
    meta,
  }) + "\n";

  fs.appendFile(logFile, entry, (err) => {
    if (err) console.error("Transaction log error:", err);
  });
};

// const { logTransaction } = require("../utils/transactionLogger");

// logTransaction("INVOICE_CREATE", "Invoice created successfully", { invoiceId });
