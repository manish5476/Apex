const express = require('express');
const paymentController = require('../controllers/paymentController');
const authController = require('../controllers/authController');

const router = express.Router();

// protect all payment routes
router.use(authController.protect);

// Create payment (admins/employees can record; you may restrict)
router.post(
  '/',
  authController.restrictTo('superadmin', 'admin', 'employee'),
  paymentController.createPayment
);

// List & create
router
  .route('/')
  .get(paymentController.getAllPayments);

// convenience listings
router.get(
  '/customer/:customerId',
  authController.restrictTo('superadmin', 'admin'),
  paymentController.getPaymentsByCustomer
);
router.get(
  '/supplier/:supplierId',
  authController.restrictTo('superadmin', 'admin'),
  paymentController.getPaymentsBySupplier
);

// individual payment operations
router
  .route('/:id')
  .get(paymentController.getPayment)
  .patch(authController.restrictTo('superadmin', 'admin'), paymentController.updatePayment)
  .delete(authController.restrictTo('superadmin'), paymentController.deletePayment);

module.exports = router;
