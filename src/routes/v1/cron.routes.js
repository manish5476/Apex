// src/modules/accounting/payments/routes/cron.routes.js
const express = require("express");
const router = express.Router();
const cronController = require("../../modules/accounting/payments/cron.controller");
const authController = require('../../modules/auth/core/auth.controller');

router.use(authController.protect);

// Simple cron management
router.get("/status", cronController.getCronStatus);
router.post("/:job/trigger", cronController.triggerCronJob);
router.post("/stop", cronController.stopCronJobs);

module.exports = router;