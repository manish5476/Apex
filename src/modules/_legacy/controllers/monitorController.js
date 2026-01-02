// src/controllers/monitorController.js
const fs = require("fs");
const path = require("path");
const logPath = path.join(__dirname, "../logs/transactions.log");

exports.getRecentTransactions = (req, res) => {
  const limit = Number(req.query.limit || 200);
  const logs = fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .slice(-limit)
    .map(JSON.parse);

  res.json({ count: logs.length, logs });
};
