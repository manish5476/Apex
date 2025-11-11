// src/routes/partyTransactionRoutes.js
const express = require('express');
const router = express.Router();
const partyTransactionController = require('../../controllers/partyTransactionController');
const authController = require('../../controllers/authController');

router.use(authController.protect);

router.get('/customers/:id/transactions', partyTransactionController.getCustomerTransactions);
router.get('/suppliers/:id/transactions', partyTransactionController.getSupplierTransactions);

module.exports = router;
