const express = require('express');
const router = express.Router();
const transactionController = require('../../controllers/transactionController');
const monitorController = require('../../controllers/monitorController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get('/', checkPermission(PERMISSIONS.TRANSACTION.READ), transactionController.getTransactions);
router.get('/export', checkPermission(PERMISSIONS.TRANSACTION.READ), transactionController.exportTransactionsCsv);

// Monitor is Executive/Analytics
router.get("/monitor/transactions", checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), monitorController.getRecentTransactions);

module.exports = router;
