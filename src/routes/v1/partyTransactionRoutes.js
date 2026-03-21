const express = require('express');
const router = express.Router();
const partyTransactionController = require('../../modules/accounting/core/partyTransactionController');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes
router.use(authController.protect);

// Get transactions by Party (Customer or Supplier)
router.get(
  '/customers/:id/transactions', 
  checkPermission(PERMISSIONS.TRANSACTION.READ), 
  partyTransactionController.getCustomerTransactions
);

router.get(
  '/suppliers/:id/transactions', 
  checkPermission(PERMISSIONS.TRANSACTION.READ), 
  partyTransactionController.getSupplierTransactions
);

module.exports = router;
