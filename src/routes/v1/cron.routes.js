// src/modules/accounting/payments/routes/cron.routes.js
const express = require("express");
const router = express.Router();
const cronController = require("../../modules/accounting/payments/cron.controller"); // Fixed relative path based on standard structure
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");
router.use(authController.protect);
router.use(authController.restrictTo("superadmin"));
router.use(checkPermission(PERMISSIONS.SYSTEM.MANAGE));

router.get("/status", cronController.getCronStatus);
router.post("/:job/trigger", cronController.triggerCronJob);
router.post("/stop", cronController.stopCronJobs);
module.exports = router;