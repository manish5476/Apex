// src/routes/v1/logRoutes.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

const router = express.Router();

// ======================================================
// 1. SECURITY STACK (Order Matters!)
// ======================================================
router.use(authController.protect);               // 1. Identify user
router.use(authController.restrictTo("superadmin")); // 2. Verify elite role
router.use(checkPermission(PERMISSIONS.LOGS.VIEW)); // 3. Verify specific permission

// Supported log files
const VALID_FILES = {
  combined: "combined.log",
  error: "error.log",
  exceptions: "exceptions.log",
  rejections: "rejections.log",
};

// ======================================================
// 2. LOG VIEWER ENDPOINT
// ======================================================
router.get("/", (req, res) => {
  const {
    file = "combined",
    search = "",
    startDate,
    endDate,
    limit = 300,
  } = req.query;

  const targetFile = VALID_FILES[file];
  if (!targetFile) {
    return res.status(400).json({
      success: false,
      message: "Invalid log file. Choose from: combined, error, exceptions, rejections",
    });
  }

  // Path resolution - Ensure this points correctly to your logs directory
  const filePath = path.join(__dirname, "../../logs", targetFile);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: `Log file ${targetFile} not found on server`,
    });
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    let lines = raw.split("\n").filter(line => line.trim() !== "");

    // Apply date filtering (Assuming JSON format from Winston/Bunyan)
    if (startDate || endDate) {
      const startTs = startDate ? new Date(startDate).getTime() : null;
      const endTs = endDate ? new Date(endDate).getTime() : null;

      lines = lines.filter((line) => {
        try {
          const json = JSON.parse(line);
          if (!json.timestamp) return false;
          const ts = new Date(json.timestamp).getTime();
          
          if (startTs && ts < startTs) return false;
          if (endTs && ts > endTs) return false;
          return true;
        } catch {
          return false; // Skip malformed lines during date filtering
        }
      });
    }

    // Apply text search
    if (search) {
      const query = search.toLowerCase();
      lines = lines.filter((line) => line.toLowerCase().includes(query));
    }

    // Slice to limit
    const totalLines = lines.length;
    lines = lines.slice(-Math.abs(limit));

    res.json({
      success: true,
      file,
      total_in_view: lines.length,
      limit_requested: limit,
      content: lines.map(l => {
        try {
          return JSON.parse(l);
        } catch {
          return { raw: l };
        }
      })
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error reading log files",
      error: error.message
    });
  }
});

module.exports = router;