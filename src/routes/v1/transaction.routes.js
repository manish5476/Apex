const express = require('express');
const router = express.Router();
const transactionController = require('../../modules/accounting/core/transaction.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes
router.use(authController.protect);

// Standard Transaction Routes
/**
 * GET /
 * @query { startDate, endDate, type, accountId, status, etc }
 * @payload none
 */
router.get('/', checkPermission(PERMISSIONS.TRANSACTION.READ), transactionController.getTransactions);

/**
 * GET /export
 * @query { startDate, endDate, type, accountId, status, etc }
 * @payload none
 */
router.get('/export', checkPermission(PERMISSIONS.TRANSACTION.READ), transactionController.exportTransactionsCsv);

module.exports = router;
