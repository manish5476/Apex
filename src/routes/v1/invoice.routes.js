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

const express     = require('express');
const router      = express.Router();
const rateLimit   = require('express-rate-limit');

// ── Controllers ───────────────────────────────────────────────────────────────
const invoiceController      = require('../../modules/accounting/billing/invoiceControllers/invoice.controller');
const invoiceProfitController = require('../../modules/accounting/billing/invoiceControllers/invoice.profit.controller');
const invoicePayment         = require('../../modules/accounting/billing/invoiceControllers/invoice.payment.controller');
const invoiceReport          = require('../../modules/accounting/billing/invoiceControllers/invoice.report.controller');
const invoicePDFController   = require('../../modules/accounting/billing/invoicePDF.controller');

// ── Auth & Middleware ─────────────────────────────────────────────────────────
const authController        = require('../../modules/auth/core/auth.controller');
const { checkPermission }   = require('../../core/middleware/permission.middleware');
const { PERMISSIONS }       = require('../../config/permissions');
const { validateStockForInvoice } = require('../../core/middleware/stockValidation.middleware');

// ── Rate Limiter ──────────────────────────────────────────────────────────────
const financialLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max:      30,         // max 30 financial operations per minute per IP
  message:  { status: 'fail', message: 'Too many requests on financial endpoints. Try again shortly.' },
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
   6. ID-BASED CRUD
   Base /:id must come before /:id/* sub-routes
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

/* ============================================================
   7. ID-BASED SPECIALIZED ACTIONS
   All /:id/* must come AFTER the base /:id route
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

module.exports = router;







// const express = require("express");
// const router = express.Router();
// const invoiceController = require("../../modules/accounting/billing/invoiceControllers/invoice.controller");
// const invoiceProfitController = require("../../modules/accounting/billing/invoiceControllers/invoice.profit.controller");
// const invoicePayment = require("../../modules/accounting/billing/invoiceControllers/invoice.payment.controller");
// const invoiceAudit = require("../../modules/accounting/billing/invoiceControllers/invoice.audit.controller");
// const invoiceReport = require("../../modules/accounting/billing/invoiceControllers/invoice.report.controller");
// const invoicePDFController = require("../../modules/accounting/billing/invoicePDF.controller");
// const authController = require("../../modules/auth/core/auth.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");
// const { validateStockForInvoice, checkStockBeforeSale } = require("../../core/middleware/stockValidation.middleware");
// const catchAsync = require("../../core/utils/api/catchAsync");
// const StockValidationService = require('../../modules/inventory/core/service/stockValidation.service')
// // Protect all routes
// router.use(authController.protect);
// const rateLimit = require('express-rate-limit');

// const financialLimiter = rateLimit({
//   windowMs: 60 * 1000, // 1 minute
//   max: 30,
//   message: 'Too many requests on financial endpoints'
// });
// /* ======================================================
//     1. ANALYTICS & REPORTS (Static High-Priority)
// ====================================================== */

// // Analytics
// router.get("/invoiceanalytics/profit-summary", checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.profitSummary);
// router.get('/invoiceanalytics/profit', checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.getProfitAnalysis);
// router.get('/invoiceanalytics/advanced-profit', checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.getAdvancedProfitAnalysis);
// router.get('/invoiceanalytics/profit-dashboard', checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.getProfitDashboard);
// router.get('/invoiceanalytics/export-profit', checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.exportProfitData);
// router.get('/invoiceanalytics/product-profit/:productId', checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.getProductProfitAnalysis);

// // Specific Reports (Using Granular Permissions)
// router.get("/reports/profit", checkPermission(PERMISSIONS.REPORT.PROFIT), invoiceProfitController.profitSummary);


// /* ======================================================
//     2. BULK & UTILITY OPERATIONS
// ====================================================== */
// // Stock check
// router.post(
//   "/check-stock",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   catchAsync(async (req, res) => {
//     const { items, branchId } = req.body;

//     // 1. Allow frontend to send branchId, fallback to user's branch
//     const targetBranchId = branchId || req.user.branchId;

//     if (!items || !Array.isArray(items) || items.length === 0) {
//       return res.status(400).json({ status: 'fail', message: 'Items are required' });
//     }

//     if (!targetBranchId) {
//       return res.status(400).json({ status: 'fail', message: 'Branch ID is missing' });
//     }

//     // 2. Call the service directly
//     const validation = await StockValidationService.validateSale(
//       items,
//       targetBranchId,
//       req.user.organizationId
//     );

//     // 3. ALWAYS return 200 OK so the frontend can read the report safely
//     res.status(200).json({
//       status: 'success',
//       isValid: validation.isValid, // true or false
//       message: validation.isValid ? 'Stock validation passed' : 'Stock validation failed',
//       warnings: validation.warnings || [],
//       stock: {
//         summary: validation.summary || {},
//         items: validation.errors || [] // This contains the items with 0 stock
//       }
//     });
//   })
// );

// // router.post("/check-stock", checkPermission(PERMISSIONS.INVOICE.CREATE), checkStockBeforeSale, (req, res) => {
// //     res.status(200).json({ status: 'success', message: 'Stock validation passed', warnings: req.stockWarnings, stock: req.stockSummary });
// // });

// router.patch("/bulk/status", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.bulkUpdateStatus);
// // router.post("/bulk/create", checkPermission(PERMISSIONS.INVOICE.CREATE), validateStockForInvoice, invoiceController.bulkCreateInvoices);
// router.post("/bulk/cancel", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.bulkCancelInvoices);

// router.get("/validate/number/:number", checkPermission(PERMISSIONS.INVOICE.CREATE), invoiceController.validateNumber);
// router.get("/export/all", checkPermission(PERMISSIONS.INVOICE.EXPORT), invoiceController.exportInvoices);
// router.get("/search/:query", checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.searchInvoices);

// /* ======================================================
//     3. DRAFTS, TRASH & RECURRING
// ====================================================== */

// router.get("/drafts/all", checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getAllDrafts);
// // router.delete("/drafts/bulk", checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.bulkDeleteDrafts);
// router.get("/trash/all", checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.getDeletedInvoices);

// // router.post("/recurring", checkPermission(PERMISSIONS.INVOICE.CREATE), validateStockForInvoice, invoiceController.createRecurringInvoice);
// // router.post("/recurring/generate", checkPermission(PERMISSIONS.INVOICE.CREATE), invoiceController.generateRecurringInvoices);

// /* ======================================================
//     4. CUSTOMER SPECIFIC (Before Root)
// ====================================================== */

// // router.get("/customer/:customerId/summary", checkPermission(PERMISSIONS.INVOICE.READ), invoiceReport.getCustomerInvoiceSummary);
// router.get("/customer/:customerId", checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoicesByCustomer);

// /* ======================================================
//     5. MAIN CRUD & ID-BASED (Must be Last)
// ====================================================== */

// router.route("/")
//   .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getAllInvoices)
//   .post(checkPermission(PERMISSIONS.INVOICE.CREATE), validateStockForInvoice, financialLimiter, invoiceController.createInvoice);

// router.route("/:id")
//   .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoice)
//   .patch(checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.updateInvoice)
//   .delete(checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.deleteInvoice);

// // --- Specialized Actions ---
// router.get("/:id/stock-info", checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoiceWithStock);
// router.post("/:id/cancel", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.cancelInvoice);
// router.post("/:id/convert", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.convertDraftToActive);
// router.get("/:id/history", checkPermission(PERMISSIONS.INVOICE.READ), invoiceAudit.getInvoiceHistory);

// // Payments
// router.route("/:id/payments")
//   .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoicePayments)
//   .post(checkPermission(PERMISSIONS.PAYMENT.CREATE), invoiceController.addPayment);

// // PDF & Comms
// router.get("/:id/download", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoicePDFController.downloadInvoicePDF);
// router.post("/:id/email", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoicePDFController.emailInvoice);
// // router.get("/:id/qr-code", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoiceController.generateQRCode);

// // Sync & Webhooks
// router.post("/:id/restore", checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.restoreInvoice);
// // router.post("/:id/webhook", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.triggerWebhook);
// // router.post("/:id/sync/accounting", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.syncWithAccounting);

// module.exports = router;
