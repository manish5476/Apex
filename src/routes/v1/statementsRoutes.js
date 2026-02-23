const express = require('express');
const router = express.Router();
const statementsController = require('../../modules/_legacy/controllers/statementsController');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes
router.use(authController.protect);

// Financial Statement Routes
router.get('/pl', checkPermission(PERMISSIONS.STATEMENT.READ), statementsController.pl);
router.get('/balance-sheet', checkPermission(PERMISSIONS.STATEMENT.READ), statementsController.balanceSheet);
router.get('/trial-balance', checkPermission(PERMISSIONS.STATEMENT.READ), statementsController.trialBalance);
router.get('/export', checkPermission(PERMISSIONS.STATEMENT.READ), statementsController.exportStatement);

module.exports = router;
