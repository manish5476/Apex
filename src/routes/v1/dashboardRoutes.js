const express = require("express");
const router = express.Router();
const dashboardController = require("../../modules/_legacy/controllers/dashboardController");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

/**
 * Main Dashboard Overview
 * Restricted to users with DASHBOARD.VIEW permission.
 * This route typically aggregates data from multiple modules for a quick summary.
 */
router.get(
  "/",
  checkPermission(PERMISSIONS.DASHBOARD.VIEW),
  dashboardController.getDashboardOverview
);

module.exports = router;