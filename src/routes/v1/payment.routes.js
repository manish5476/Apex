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
/**
 * POST /webhook
 * @payload { <Gateway specific webhook payload> }
 */
router.post('/webhook', paymentController.paymentGatewayWebhook);

/* ============================================================
   STATIC / UTILITY ROUTES  (before /:id)
   ============================================================ */

// Reports
/**
 * GET /export
 * @query { startDate, endDate, status, etc }
 * @payload none
 */
router.get('/export',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.exportPayments
);

// Allocation report
/**
 * GET /allocation/report
 * @query { startDate, endDate }
 * @payload none
 */
router.get('/allocation/report',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getAllocationReport
);

// Customer-scoped
/**
 * GET /customer/:customerId
 * @params { customerId }
 * @payload none
 */
router.get('/customer/:customerId',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getPaymentsByCustomer
);

/**
 * GET /customer/:customerId/summary
 * @params { customerId }
 * @payload none
 */
router.get('/customer/:customerId/summary',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getCustomerPaymentSummary
);

/**
 * GET /customer/:customerId/unallocated
 * @params { customerId }
 * @payload none
 */
router.get('/customer/:customerId/unallocated',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getUnallocatedPayments
);

// Supplier-scoped
/**
 * GET /supplier/:supplierId
 * @params { supplierId }
 * @payload none
 */
router.get('/supplier/:supplierId',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getPaymentsBySupplier
);

/* ============================================================
   ROOT CRUD
   ============================================================ */
/* ============================================================
   ROOT CRUD
   ============================================================ */
router.route('/')
  /**
   * GET /
   * @query { page, limit, status, etc }
   * @payload none
   */
  .get(
    checkPermission(PERMISSIONS.PAYMENT.READ),
    paymentController.getAllPayments
  )
  /**
   * POST /
   * @payload { amount*, paymentMethod*, referenceId, customerId (or supplierId), date, notes }
   */
  .post(
    checkPermission(PERMISSIONS.PAYMENT.CREATE),
    financialLimiter,
    paymentController.createPayment
  );

/* ============================================================
   ID-BASED OPERATIONS  (must come after static routes)
   ============================================================ */
/* ============================================================
   ID-BASED OPERATIONS  (must come after static routes)
   ============================================================ */
router.route('/:id')
  /**
   * GET /:id
   * @params { id }
   * @payload none
   */
  .get(
    checkPermission(PERMISSIONS.PAYMENT.READ),
    paymentController.getPayment
  )
  /**
   * DELETE /:id
   * @params { id }
   * @payload none
   */
  .delete(
    checkPermission(PERMISSIONS.PAYMENT.DELETE),
    financialLimiter,
    paymentController.deletePayment
  );

// Cancel a completed payment (reversal)
/**
 * POST /:id/cancel
 * @params { id }
 * @payload { reason* }
 */
router.post('/:id/cancel',
  checkPermission(PERMISSIONS.PAYMENT.UPDATE),
  financialLimiter,
  paymentController.cancelPayment
);

// PDF receipt
/**
 * GET /:id/receipt
 * @params { id }
 * @payload none
 */
router.get('/:id/receipt',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.downloadReceipt
);

/**
 * POST /:id/email
 * @params { id }
 * @payload { email (optional) }
 */
router.post('/:id/email',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.emailReceipt
);

// Allocation operations
/**
 * POST /:paymentId/allocate/auto
 * @params { paymentId }
 * @payload none
 */
router.post('/:paymentId/allocate/auto',
  checkPermission(PERMISSIONS.PAYMENT.UPDATE),
  paymentController.autoAllocatePayment
);

/**
 * POST /:paymentId/allocate/manual
 * @params { paymentId }
 * @payload { allocations* (array of { invoiceId, amount }) }
 */
router.post('/:paymentId/allocate/manual',
  checkPermission(PERMISSIONS.PAYMENT.UPDATE),
  paymentController.manualAllocatePayment
);

module.exports = router;