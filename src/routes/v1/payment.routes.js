'use strict';

/**
 * Payment Routes  — mounted at /api/v1/payments
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const paymentController = require('../../modules/accounting/payments/payment.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

const financialLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30,
  message: { status: 'fail', message: 'Too many payment requests. Try again shortly.' },
});

// ── All routes require authentication ────────────────────────
router.use(authController.protect);

/* ============================================================
   WEBHOOKS (no auth — verified by signature in controller)
   Must be defined FIRST and BEFORE router.use(protect)
   if your gateway doesn't send auth headers.
   If you need it public, move this BEFORE router.use(protect).
   ============================================================ */
router.post('/webhook', paymentController.paymentGatewayWebhook);

/* ============================================================
   STATIC / UTILITY ROUTES  (before /:id)
   ============================================================ */

// Reports
router.get('/export',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.exportPayments
);

// Allocation report
router.get('/allocation/report',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getAllocationReport
);

// Customer-scoped
router.get('/customer/:customerId',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getPaymentsByCustomer
);
router.get('/customer/:customerId/summary',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getCustomerPaymentSummary
);
router.get('/customer/:customerId/unallocated',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getUnallocatedPayments
);

// Supplier-scoped
router.get('/supplier/:supplierId',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getPaymentsBySupplier
);

/* ============================================================
   ROOT CRUD
   ============================================================ */
router.route('/')
  .get(
    checkPermission(PERMISSIONS.PAYMENT.READ),
    paymentController.getAllPayments
  )
  .post(
    checkPermission(PERMISSIONS.PAYMENT.CREATE),
    financialLimiter,
    paymentController.createPayment
  );

/* ============================================================
   ID-BASED OPERATIONS  (must come after static routes)
   ============================================================ */
router.route('/:id')
  .get(
    checkPermission(PERMISSIONS.PAYMENT.READ),
    paymentController.getPayment
  )
  .delete(
    checkPermission(PERMISSIONS.PAYMENT.DELETE),
    financialLimiter,
    paymentController.deletePayment
  );

// Cancel a completed payment (reversal)
router.post('/:id/cancel',
  checkPermission(PERMISSIONS.PAYMENT.UPDATE),
  financialLimiter,
  paymentController.cancelPayment
);

// PDF receipt
router.get('/:id/receipt',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.downloadReceipt
);
router.post('/:id/email',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.emailReceipt
);

// Allocation operations
router.post('/:paymentId/allocate/auto',
  checkPermission(PERMISSIONS.PAYMENT.UPDATE),
  paymentController.autoAllocatePayment
);
router.post('/:paymentId/allocate/manual',
  checkPermission(PERMISSIONS.PAYMENT.UPDATE),
  paymentController.manualAllocatePayment
);

module.exports = router;