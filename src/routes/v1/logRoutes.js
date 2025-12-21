// src/routes/v1/logRoutes.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

const router = express.Router();

router.use(checkPermission(PERMISSIONS.LOGS.VIEW));
router.use(authController.restrictTo("superadmin"));

// Supported log files
const VALID_FILES = {
  combined: "combined.log",
  error: "error.log",
  exceptions: "exceptions.log",
  rejections: "rejections.log",
};

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
      message: "Invalid log file",
    });
  }

  const filePath = path.join(__dirname, "../../logs", targetFile);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: "Log file not found",
    });
  }
  const raw = fs.readFileSync(filePath, "utf8");
  let lines = raw.split("\n");

  // Apply date filtering
  if (startDate || endDate) {
    lines = lines.filter((line) => {
      try {
        const json = JSON.parse(line);

        if (!json.timestamp) return false;

        const ts = new Date(json.timestamp).getTime();
        if (startDate && ts < new Date(startDate).getTime()) return false;
        if (endDate && ts > new Date(endDate).getTime()) return false;

        return true;
      } catch {
        return false;
      }
    });
  }
  if (search) {
    lines = lines.filter((line) => line.toLowerCase().includes(search.toLowerCase()));
  }
  lines = lines.slice(-limit);
  res.json({
    success: true,
    file,
    count: lines.length,
    content: lines
      .map(l => {
        const clean = l.trim();
        if (!clean) return null;

        try {
          return JSON.parse(clean);
        } catch {
          return { raw: clean };
        }
      })
      .filter(Boolean)
  });

});

module.exports = router;