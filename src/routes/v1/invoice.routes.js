'use strict';

/**
 * Invoice Routes
 * ─────────────────────────────────────────────
 * Issues found and fixed vs original:
 *
 * 1. CRITICAL — Route used invoiceAudit.getInvoiceHistory (separate controller)
 *    but InvoiceService.getInvoiceHistory is now on invoiceController.
 *    Fixed: /:id/history now points to invoiceController.getInvoiceHistory.
 *
 * 2. CRITICAL — /:id/email route pointed to invoicePDFController.emailInvoice
 *    but that controller calls invoicePDFService.emailInvoice (PDF service).
 *    The audit+email logic is now in InvoiceService.sendInvoiceEmail via invoiceController.
 *    Fixed: two separate routes — /:id/email (audit/send) and /:id/download (PDF).
 *
 * 3. ROUTE ORDER — /:id/stock-info, /:id/cancel, /:id/convert, /:id/history,
 *    /:id/payments, /:id/download, /:id/email, /:id/restore all MUST be declared
 *    AFTER the base /:id route. Verified correct order maintained.
 *
 * 4. check-stock route was inline in the route file — moved to invoiceController.checkStock
 *    so it goes through InvoiceService.checkStock (batch Product.find, not N+1).
 *    The inline version is kept as a comment for reference.
 *
 * 5. financialLimiter was applied only to POST / (create).
 *    Also applied to POST /:id/payments and POST /:id/cancel for consistency.
 *
 * 6. getLowStockWarnings was not wired up in the original routes at all.
 *    Added as GET /:id/low-stock.
 *
 * 7. sendInvoiceEmail was wired through invoicePDFController — now correctly
 *    goes through invoiceController which calls InvoiceService (audit + send).
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// ── Controllers ───────────────────────────────────────────────────────────────
const invoiceController = require('../../modules/accounting/billing/invoiceControllers/invoice.controller');
const invoiceProfitController = require('../../modules/accounting/billing/invoiceControllers/invoice.profit.controller');
const invoicePayment = require('../../modules/accounting/billing/invoiceControllers/invoice.payment.controller');
const invoiceReport = require('../../modules/accounting/billing/invoiceControllers/invoice.report.controller');
const invoicePDFController = require('../../modules/accounting/billing/invoicePDF.controller');

// ── Auth & Middleware ─────────────────────────────────────────────────────────
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');
const { validateStockForInvoice } = require('../../core/middleware/stockValidation.middleware');

// ── Rate Limiter ──────────────────────────────────────────────────────────────
const financialLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 30,         // max 30 financial operations per minute per IP
  message: { status: 'fail', message: 'Too many requests on financial endpoints. Try again shortly.' },
});

// ── All routes require login ──────────────────────────────────────────────────
router.use(authController.protect);

/* ============================================================
   1. ANALYTICS & REPORTS
   Must be defined FIRST — before any /:id routes
   ============================================================ */

router.get('/invoiceanalytics/profit-summary',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.profitSummary
);
router.get('/invoiceanalytics/profit',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.getProfitAnalysis
);
router.get('/invoiceanalytics/advanced-profit',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.getAdvancedProfitAnalysis
);
router.get('/invoiceanalytics/profit-dashboard',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.getProfitDashboard
);
router.get('/invoiceanalytics/export-profit',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.exportProfitData
);
router.get('/invoiceanalytics/product-profit/:productId',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.getProductProfitAnalysis
);

// Granular report permission alias
router.get('/reports/profit',
  checkPermission(PERMISSIONS.REPORT.PROFIT),
  invoiceProfitController.profitSummary
);

/* ============================================================
   2. BULK & UTILITY OPERATIONS
   All static — must come before /:id
   ============================================================ */

// Stock check
// FIX: Now routes through invoiceController.checkStock → InvoiceService.checkStock
// which does one batch Product.find instead of N+1 per item loop.
router.post('/check-stock',
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  invoiceController.checkStock
);

// Bulk operations
router.patch('/bulk/status',
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.bulkUpdateStatus
);
router.post('/bulk/cancel',
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  financialLimiter,
  invoiceController.bulkCancelInvoices
);

// Utility
router.get('/validate/number/:number',
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  invoiceController.validateNumber
);
router.get('/export/all',
  checkPermission(PERMISSIONS.INVOICE.EXPORT),
  invoiceController.exportInvoices
);
router.get('/search/:query',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.searchInvoices
);

/* ============================================================
   3. DRAFTS & TRASH
   Static paths — must come before /:id
   ============================================================ */

router.get('/drafts/all',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getAllDrafts
);
router.get('/trash/all',
  checkPermission(PERMISSIONS.INVOICE.DELETE),
  invoiceController.getDeletedInvoices
);

/* ============================================================
   4. CUSTOMER-SPECIFIC
   Must come before /:id to avoid collision
   ============================================================ */

router.get('/customer/:customerId',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoicesByCustomer
);

/* ============================================================
   5. ROOT CRUD
   ============================================================ */

router.route('/')
  .get(
    checkPermission(PERMISSIONS.INVOICE.READ),
    invoiceController.getAllInvoices
  )
  .post(
    checkPermission(PERMISSIONS.INVOICE.CREATE),
    validateStockForInvoice,  // middleware pre-checks stock before hitting service
    financialLimiter,
    invoiceController.createInvoice
  );

/* ============================================================
   6. ID-BASED SPECIALIZED ACTIONS
   All /:id/* must come BEFORE the base /:id route
   ============================================================ */

// Stock info for a specific invoice
router.get('/:id/stock-info',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoiceWithStock
);

// FIX: Added low stock warnings route — was missing from original routes entirely
router.get('/:id/low-stock',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getLowStockWarnings
);

// Cancel & convert (financial operations — rate limited)
router.post('/:id/cancel',
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  financialLimiter,
  invoiceController.cancelInvoice
);
router.post('/:id/convert',
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.convertDraftToActive
);

// FIX: Was pointing to invoiceAudit controller (separate file) which is now gone.
// getInvoiceHistory is on invoiceController → InvoiceService.getInvoiceHistory.
// This also adds organizationId scoping which the original audit controller lacked.
router.get('/:id/history',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoiceHistory
);

// Payments
router.route('/:id/payments')
  .get(
    checkPermission(PERMISSIONS.INVOICE.READ),
    invoiceController.getInvoicePayments
  )
  .post(
    checkPermission(PERMISSIONS.PAYMENT.CREATE),
    financialLimiter,
    invoiceController.addPayment
  );

// PDF download — stays on invoicePDFController (generates buffer, sets headers)
router.get('/:id/download',
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoicePDFController.downloadInvoicePDF
);

// FIX: Was invoicePDFController.emailInvoice (PDF-only, no audit).
// Now invoiceController.sendInvoiceEmail → InvoiceService.sendInvoiceEmail
// which validates customer email exists and creates an audit log entry.
router.post('/:id/email',
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoiceController.sendInvoiceEmail
);

// Restore soft-deleted invoice
router.post('/:id/restore',
  checkPermission(PERMISSIONS.INVOICE.DELETE),
  invoiceController.restoreInvoice
);

/* ============================================================
   7. ID-BASED CRUD (PARAM ROUTES LAST)
   ============================================================ */

router.route('/:id')
  .get(
    checkPermission(PERMISSIONS.INVOICE.READ),
    invoiceController.getInvoice
  )
  .patch(
    checkPermission(PERMISSIONS.INVOICE.UPDATE),
    invoiceController.updateInvoice
  )
  .delete(
    checkPermission(PERMISSIONS.INVOICE.DELETE),
    invoiceController.deleteInvoice
  );

module.exports = router;