const express = require('express');
const emiController = require('../controllers/emiController');
const authController = require('../controllers/authController');

const router = express.Router();

router.use(authController.protect);

// Create EMI plan
router.post(
  '/',
  authController.restrictTo('superadmin', 'admin'),
  emiController.createEmiPlan
);

// Get EMI details for an invoice
router.get(
  '/invoice/:invoiceId',
  authController.restrictTo('superadmin', 'admin', 'employee'),
  emiController.getEmiByInvoice
);

// Pay EMI installment
router.patch(
  '/pay',
  authController.restrictTo('superadmin', 'admin', 'employee'),
  emiController.payEmiInstallment
);

module.exports = router;
