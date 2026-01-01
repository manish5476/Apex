const express = require('express');
const router = express.Router();
const partyTransactionController = require('../../controllers/partyTransactionController');
const authController = require('@modules/auth/core/auth.controller');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get('/customers/:id/transactions', checkPermission(PERMISSIONS.TRANSACTION.READ), partyTransactionController.getCustomerTransactions);
router.get('/suppliers/:id/transactions', checkPermission(PERMISSIONS.TRANSACTION.READ), partyTransactionController.getSupplierTransactions);

module.exports = router;