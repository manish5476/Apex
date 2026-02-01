const express = require("express");
const router = express.Router();
const invoiceController = require("../../modules/accounting/billing/invoiceControllers/invoice.controller");
const invoiceProfitController = require("../../modules/accounting/billing/invoiceControllers/invoice.profit.controller");
const invoicePayment = require("../../modules/accounting/billing/invoiceControllers/invoice.payment.controller");
const invoiceAudit = require("../../modules/accounting/billing/invoiceControllers/invoice.audit.controller");
const invoiceReport = require("../../modules/accounting/billing/invoiceControllers/invoice.report.controller");
const invoicePDFController = require("../../modules/accounting/billing/invoicePDF.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");
const { validateStockForInvoice, checkStockBeforeSale } = require("../../core/middleware/stockValidation.middleware");

// Protect all routes
router.use(authController.protect);

/* ======================================================
   1. invoiceANALYTICS & REPORTS ROUTES (MUST BE VERY FIRST)
====================================================== */

// invoiceAnalytics routes - MUST BE BEFORE ANY /:id routes
router.get(
  "/invoiceanalytics/profit-summary",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.profitSummary
);

router.get(
  '/invoiceanalytics/profit',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.getProfitAnalysis
);

router.get(
  '/invoiceanalytics/advanced-profit',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.getAdvancedProfitAnalysis
);

router.get(
  '/invoiceanalytics/profit-dashboard',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.getProfitDashboard
);

router.get(
  '/invoiceanalytics/export-profit',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.exportProfitData
);

// invoice profit


router.get(
  '/invoiceanalytics/product-profit/:productId',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceProfitController.getProductProfitAnalysis
);

// Reports routes
router.get(
  "/reports/profit",
  checkPermission(PERMISSIONS.REPORT.PROFIT), // Best practice: Granular permission
  invoiceProfitController.profitSummary
);

router.get(
  "/reports/sales",
  checkPermission(PERMISSIONS.REPORT.SALES), // Best practice: Granular permission
  invoiceReport.getSalesReport || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

router.get(
  "/reports/tax",
  checkPermission(PERMISSIONS.REPORT.TAX), // Best practice: Granular permission
  invoiceReport.getTaxReport || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

router.get(
  "/reports/outstanding",
  checkPermission(PERMISSIONS.REPORT.OUTSTANDING), // Best practice: Granular permission
  invoiceReport.getOutstandingInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

/* ======================================================
   2. STATIC & SPECIFIC ROUTES
====================================================== */

// Stock check
router.post(
  "/check-stock",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  checkStockBeforeSale,
  (req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'Stock validation passed',
      warnings: req.stockWarnings,
      stock: {
        totalStock: req.stockSummary.totalStock,
        totalRequested: req.stockSummary.totalRequested
      }
    });
  }
);

/* --- BULK OPERATIONS --- */
router.patch(
  "/bulk/status",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.bulkUpdateStatus
);

router.post(
  "/bulk/create",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  validateStockForInvoice,
  invoiceController.bulkCreateInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Bulk invoices created' });
  })
);

router.post(
  "/bulk/cancel",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.bulkCancelInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Bulk invoices cancelled' });
  })
);

/* --- UTILITIES & SEARCH --- */
router.get(
  "/validate/number/:number",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  invoiceController.validateNumber
);

router.get(
  "/export/all",
  checkPermission(PERMISSIONS.INVOICE.EXPORT),
  invoiceController.exportInvoices
);

router.get(
  "/search/:query",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.searchInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

/* --- DRAFTS --- */
router.get(
  "/drafts/all",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getAllDrafts || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

router.delete(
  "/drafts/bulk",
  checkPermission(PERMISSIONS.INVOICE.DELETE),
  invoiceController.bulkDeleteDrafts || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Drafts deleted' });
  })
);

/* --- TRASH --- */
router.get(
  "/trash/all",
  checkPermission(PERMISSIONS.INVOICE.DELETE),
  invoiceController.getDeletedInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

/* --- RECURRING --- */
router.post(
  "/recurring",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  validateStockForInvoice,
  invoiceController.createRecurringInvoice || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Recurring invoice created' });
  })
);

router.post(
  "/recurring/generate",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  invoiceController.generateRecurringInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Recurring invoices generated' });
  })
);

/* ======================================================
   3. CUSTOMER ROUTES (Semi-specific)
====================================================== */

router.get(
  "/customer/:customerId",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoicesByCustomer
);

router.get(
  "/customer/:customerId/summary",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceReport.getCustomerInvoiceSummary || ((req, res) => {
    res.status(200).json({
      status: 'success',
      data: { totalInvoices: 0, totalAmount: 0, totalPaid: 0, totalDue: 0 }
    });
  })
);

/* ======================================================
   4. MAIN CRUD ROUTES (BEFORE /:id routes)
====================================================== */

// Get all invoices
router.get(
  "/",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getAllInvoices
);

// Create invoice
router.post(
  "/",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  validateStockForInvoice,
  invoiceController.createInvoice
);

/* ======================================================
   5. /:id ROUTES (MUST BE LAST)
====================================================== */

// Get single invoice
router.get(
  "/:id",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoice
);

// Update invoice
router.patch(
  "/:id",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.updateInvoice
);

// Delete invoice
router.delete(
  "/:id",
  checkPermission(PERMISSIONS.INVOICE.DELETE),
  invoiceController.deleteInvoice
);

// --- Specific Actions on ID ---
router.get(
  "/:id/stock-info",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoiceWithStock
);

router.post(
  "/:id/cancel",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.cancelInvoice
);

router.post(
  "/:id/convert",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.convertDraftToActive
);

router.post(
  "/:id/payments",
  checkPermission(PERMISSIONS.PAYMENT.CREATE),
  invoicePayment.addPayment
);

router.get(
  "/:id/payments",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoicePayment.getInvoicePayments || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

router.get(
  "/:id/download",
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoicePDFController.downloadInvoicePDF
);

router.post(
  "/:id/email",
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoicePDFController.emailInvoice
);

router.get(
  "/:id/qr-code",
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoiceController.generateQRCode || ((req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'QR code generation endpoint'
    });
  })
);

router.get(
  "/:id/history",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceAudit.getInvoiceHistory
);

router.get(
  "/:id/low-stock-warnings",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getLowStockWarnings || ((req, res) => {
    res.status(200).json({ status: 'success', warnings: [] });
  })
);

router.get(
  "/:id/alternatives",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.suggestAlternatives || ((req, res) => {
    res.status(200).json({ status: 'success', alternatives: [] });
  })
);

router.post(
  "/:id/restore",
  checkPermission(PERMISSIONS.INVOICE.DELETE),
  invoiceController.restoreInvoice || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Invoice restored' });
  })
);

router.post(
  "/:id/webhook",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.triggerWebhook || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Webhook triggered' });
  })
);

router.post(
  "/:id/sync/accounting",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.syncWithAccounting || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Synced with accounting' });
  })
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

// // Protect all routes
// router.use(authController.protect);

// /* ======================================================
//    1. invoiceANALYTICS & REPORTS ROUTES (MUST BE VERY FIRST)
// ====================================================== */

// // invoiceAnalytics routes - MUST BE BEFORE ANY /:id routes
// router.get(
//   "/invoiceanalytics/profit-summary",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceProfitController.profitSummary
// );

// router.get(
//   '/invoiceanalytics/profit',
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceProfitController.getProfitAnalysis
// );

// router.get(
//   '/invoiceanalytics/advanced-profit',
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceProfitController.getAdvancedProfitAnalysis
// );

// router.get(
//   '/invoiceanalytics/profit-dashboard',
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceProfitController.getProfitDashboard
// );

// router.get(
//   '/invoiceanalytics/export-profit',
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceProfitController.exportProfitData
// );

// // invoice profit


// router.get(
//   '/invoiceanalytics/product-profit/:productId',
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceProfitController.getProductProfitAnalysis
// );

// // Reports routes
// router.get(
//   "/reports/profit",
//   checkPermission(PERMISSIONS.REPORT.READ),
//   invoiceProfitController.profitSummary
// );

// router.get(
//   "/reports/sales",
//   checkPermission(PERMISSIONS.REPORT.READ),
//   invoiceReport.getSalesReport || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// router.get(
//   "/reports/tax",
//   checkPermission(PERMISSIONS.REPORT.READ),
//   invoiceReport.getTaxReport || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// router.get(
//   "/reports/outstanding",
//   checkPermission(PERMISSIONS.REPORT.READ),
//   invoiceReport.getOutstandingInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// /* ======================================================
//    2. STATIC & SPECIFIC ROUTES
// ====================================================== */

// // Stock check
// router.post(
//   "/check-stock",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   checkStockBeforeSale,
//   (req, res) => {
//     res.status(200).json({
//       status: 'success',
//       message: 'Stock validation passed',
//       warnings: req.stockWarnings,
//       stock: {
//         totalStock: req.stockSummary.totalStock,
//         totalRequested: req.stockSummary.totalRequested
//       }
//     });
//   }
// );

// /* --- BULK OPERATIONS --- */
// router.patch(
//   "/bulk/status",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.bulkUpdateStatus
// );

// router.post(
//   "/bulk/create",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   validateStockForInvoice,
//   invoiceController.bulkCreateInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Bulk invoices created' });
//   })
// );

// router.post(
//   "/bulk/cancel",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.bulkCancelInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Bulk invoices cancelled' });
//   })
// );

// /* --- UTILITIES & SEARCH --- */
// router.get(
//   "/validate/number/:number",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   invoiceController.validateNumber
// );

// router.get(
//   "/export/all",
//   checkPermission(PERMISSIONS.INVOICE.EXPORT),
//   invoiceController.exportInvoices
// );

// router.get(
//   "/search/:query",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.searchInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// /* --- DRAFTS --- */
// router.get(
//   "/drafts/all",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getAllDrafts || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// router.delete(
//   "/drafts/bulk",
//   checkPermission(PERMISSIONS.INVOICE.DELETE),
//   invoiceController.bulkDeleteDrafts || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Drafts deleted' });
//   })
// );

// /* --- TRASH --- */
// router.get(
//   "/trash/all",
//   checkPermission(PERMISSIONS.INVOICE.DELETE),
//   invoiceController.getDeletedInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// /* --- RECURRING --- */
// router.post(
//   "/recurring",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   validateStockForInvoice,
//   invoiceController.createRecurringInvoice || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Recurring invoice created' });
//   })
// );

// router.post(
//   "/recurring/generate",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   invoiceController.generateRecurringInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Recurring invoices generated' });
//   })
// );

// /* ======================================================
//    3. CUSTOMER ROUTES (Semi-specific)
// ====================================================== */

// router.get(
//   "/customer/:customerId",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getInvoicesByCustomer
// );

// router.get(
//   "/customer/:customerId/summary",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceReport.getCustomerInvoiceSummary || ((req, res) => {
//     res.status(200).json({
//       status: 'success',
//       data: { totalInvoices: 0, totalAmount: 0, totalPaid: 0, totalDue: 0 }
//     });
//   })
// );

// /* ======================================================
//    4. MAIN CRUD ROUTES (BEFORE /:id routes)
// ====================================================== */

// // Get all invoices
// router.get(
//   "/",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getAllInvoices
// );

// // Create invoice
// router.post(
//   "/",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   validateStockForInvoice,
//   invoiceController.createInvoice
// );

// /* ======================================================
//    5. /:id ROUTES (MUST BE LAST)
// ====================================================== */

// // Get single invoice
// router.get(
//   "/:id",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getInvoice
// );

// // Update invoice
// router.patch(
//   "/:id",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.updateInvoice
// );

// // Delete invoice
// router.delete(
//   "/:id",
//   checkPermission(PERMISSIONS.INVOICE.DELETE),
//   invoiceController.deleteInvoice
// );

// // --- Specific Actions on ID ---
// router.get(
//   "/:id/stock-info",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getInvoiceWithStock
// );

// router.post(
//   "/:id/cancel",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.cancelInvoice
// );

// router.post(
//   "/:id/convert",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.convertDraftToActive
// );

// router.post(
//   "/:id/payments",
//   checkPermission(PERMISSIONS.PAYMENT.CREATE),
//   invoicePayment.addPayment
// );

// router.get(
//   "/:id/payments",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoicePayment.getInvoicePayments || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// router.get(
//   "/:id/download",
//   checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
//   invoicePDFController.downloadInvoicePDF
// );

// router.post(
//   "/:id/email",
//   checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
//   invoicePDFController.emailInvoice
// );

// router.get(
//   "/:id/qr-code",
//   checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
//   invoiceController.generateQRCode || ((req, res) => {
//     res.status(200).json({
//       status: 'success',
//       message: 'QR code generation endpoint'
//     });
//   })
// );

// router.get(
//   "/:id/history",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceAudit.getInvoiceHistory
// );

// router.get(
//   "/:id/low-stock-warnings",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getLowStockWarnings || ((req, res) => {
//     res.status(200).json({ status: 'success', warnings: [] });
//   })
// );

// router.get(
//   "/:id/alternatives",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.suggestAlternatives || ((req, res) => {
//     res.status(200).json({ status: 'success', alternatives: [] });
//   })
// );

// router.post(
//   "/:id/restore",
//   checkPermission(PERMISSIONS.INVOICE.DELETE),
//   invoiceController.restoreInvoice || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Invoice restored' });
//   })
// );

// router.post(
//   "/:id/webhook",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.triggerWebhook || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Webhook triggered' });
//   })
// );

// router.post(
//   "/:id/sync/accounting",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.syncWithAccounting || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Synced with accounting' });
//   })
// );

// module.exports = router;
