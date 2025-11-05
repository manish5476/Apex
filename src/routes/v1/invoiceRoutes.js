const express = require('express');
const invoiceController = require('../../controllers/invoiceController');
const authController = require('../../controllers/authController');

const router = express.Router();

/* ==========================================================
 *  PROTECTED ROUTES
 * ========================================================== */
router.use(authController.protect);

// Create and list invoices
router
  .route('/')
  .post(
    authController.restrictTo('superadmin', 'admin'),
    invoiceController.createInvoice
  )
  .get(invoiceController.getAllInvoices);

// Get invoices by customer
router.get(
  '/customer/:customerId',
  authController.restrictTo('superadmin', 'admin'),
  invoiceController.getInvoicesByCustomer
);

// Individual invoice routes
router
  .route('/:id')
  .get(invoiceController.getInvoice)
  .patch(
    authController.restrictTo('superadmin', 'admin'),
    invoiceController.updateInvoice
  )
  .delete(
    authController.restrictTo('superadmin'),
    invoiceController.deleteInvoice
  );

module.exports = router;
