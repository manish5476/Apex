const express = require("express");
const router = express.Router();
const automationController = require("../../modules/_legacy/controllers/automationController");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. WEBHOOK MANAGEMENT
// ======================================================

router.route("/webhooks")
  .get(checkPermission(PERMISSIONS.AUTOMATION.READ), automationController.getAllWebhooks)
  .post(checkPermission(PERMISSIONS.AUTOMATION.WEBHOOK), automationController.createWebhook);

router.route("/webhooks/:id")
  .patch(checkPermission(PERMISSIONS.AUTOMATION.WEBHOOK), automationController.updateWebhook)
  .delete(checkPermission(PERMISSIONS.AUTOMATION.WEBHOOK), automationController.deleteWebhook);

// ======================================================
// 2. WORKFLOW MANAGEMENT
// ======================================================

router.route("/workflows")
  .get(checkPermission(PERMISSIONS.AUTOMATION.READ), automationController.getAllWorkflows)
  .post(checkPermission(PERMISSIONS.AUTOMATION.WORKFLOW), automationController.createWorkflow);

router.route("/workflows/:id")
  .patch(checkPermission(PERMISSIONS.AUTOMATION.WORKFLOW), automationController.updateWorkflow)
  .delete(checkPermission(PERMISSIONS.AUTOMATION.WORKFLOW), automationController.deleteWorkflow);

module.exports = router;