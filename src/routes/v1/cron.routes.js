// src/modules/accounting/payments/routes/cron.routes.js
const express = require("express");
const router = express.Router();
const cronController = require("../controllers/cron.controller"); // Fixed relative path based on standard structure
const authController = require('../../../auth/core/auth.controller');
const { checkPermission } = require("../../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../../config/permissions");

// ======================================================
// SYSTEM-LEVEL JOB MANAGEMENT
// ======================================================

// 1. Identify User
router.use(authController.protect);

// 2. Critical Security: Only SuperAdmins should touch automated financial jobs
router.use(authController.restrictTo("superadmin"));

// 3. Permission Check
router.use(checkPermission(PERMISSIONS.SYSTEM.MANAGE));

/**
 * These endpoints control background tasks like:
 * - EMI Overdue Checks
 * - Recurring Invoice Generation
 * - Payment Reconciliation Syncs
 */

// View current status of scheduled tasks
router.get("/status", cronController.getCronStatus);

// Manually trigger a specific background job (e.g., /emi-check/trigger)
router.post("/:job/trigger", cronController.triggerCronJob);

// Emergency stop for all scheduled background processing
router.post("/stop", cronController.stopCronJobs);

module.exports = router;