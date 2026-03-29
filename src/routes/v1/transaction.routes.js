const express = require('express');
const router = express.Router();
const transactionController = require('../../modules/accounting/core/transaction.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes
router.use(authController.protect);

// Standard Transaction Routes
router.get('/', checkPermission(PERMISSIONS.TRANSACTION.READ), transactionController.getTransactions);
router.get('/export', checkPermission(PERMISSIONS.TRANSACTION.READ), transactionController.exportTransactionsCsv);

module.exports = router;
