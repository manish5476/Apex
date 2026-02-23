const express = require("express");
const router = express.Router();
const feedController = require("../../modules/_legacy/controllers/feedController");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// CUSTOMER ACTIVITY FEEDS
// ======================================================

/**
 * Retrieves a chronological feed of all activities related to a specific customer.
 * Uses specific FEED.READ permission to allow viewing timelines without full CRM access.
 */
router.get(
  "/customer/:customerId", 
  checkPermission(PERMISSIONS.FEED.READ), 
  feedController.getCustomerFeed
);

module.exports = router;