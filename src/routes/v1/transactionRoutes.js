// src/routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const transactionController = require('../../controllers/transactionController');
const authController = require('../../controllers/authController'); // adjust path if necessary
const monitorController= require('../../controllers/monitorController'); // adjust path if necessary
// protect route
router.use(authController.protect);

router.get('/', transactionController.getTransactions);
router.get('/export', transactionController.exportTransactionsCsv);

router.get("/monitor/transactions", authController.restrictTo("superadmin"), monitorController.getRecentTransactions);

module.exports = router;
