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
    1. ANALYTICS & REPORTS (Static High-Priority)
====================================================== */

// Analytics
router.get("/invoiceanalytics/profit-summary", checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.profitSummary);
router.get('/invoiceanalytics/profit', checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.getProfitAnalysis);
router.get('/invoiceanalytics/advanced-profit', checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.getAdvancedProfitAnalysis);
router.get('/invoiceanalytics/profit-dashboard', checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.getProfitDashboard);
router.get('/invoiceanalytics/export-profit', checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.exportProfitData);
router.get('/invoiceanalytics/product-profit/:productId', checkPermission(PERMISSIONS.INVOICE.READ), invoiceProfitController.getProductProfitAnalysis);

// Specific Reports (Using Granular Permissions)
router.get("/reports/profit", checkPermission(PERMISSIONS.REPORT.PROFIT), invoiceProfitController.profitSummary);
router.get("/reports/sales", checkPermission(PERMISSIONS.REPORT.SALES), invoiceReport.getSalesReport || ((req, res) => res.status(200).json({ status: 'success', data: [] })));
router.get("/reports/tax", checkPermission(PERMISSIONS.REPORT.TAX), invoiceReport.getTaxReport || ((req, res) => res.status(200).json({ status: 'success', data: [] })));
router.get("/reports/outstanding", checkPermission(PERMISSIONS.REPORT.OUTSTANDING), invoiceReport.getOutstandingInvoices || ((req, res) => res.status(200).json({ status: 'success', data: [] })));

/* ======================================================
    2. BULK & UTILITY OPERATIONS
====================================================== */
// Stock check
/* ======================================================
    2. BULK & UTILITY OPERATIONS
====================================================== */
// Stock check
router.post(
  "/check-stock",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  catchAsync(async (req, res) => {
    const { items, branchId } = req.body;

    // 1. Allow frontend to send branchId, fallback to user's branch
    const targetBranchId = branchId || req.user.branchId;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: 'fail', message: 'Items are required' });
    }

    if (!targetBranchId) {
      return res.status(400).json({ status: 'fail', message: 'Branch ID is missing' });
    }

    // 2. Call the service directly
    const validation = await StockValidationService.validateSale(
      items,
      targetBranchId,
      req.user.organizationId
    );

    // 3. ALWAYS return 200 OK so the frontend can read the report safely
    res.status(200).json({
      status: 'success',
      isValid: validation.isValid, // true or false
      message: validation.isValid ? 'Stock validation passed' : 'Stock validation failed',
      warnings: validation.warnings || [],
      stock: {
        summary: validation.summary || {},
        items: validation.errors || [] // This contains the items with 0 stock
      }
    });
  })
);

// router.post("/check-stock", checkPermission(PERMISSIONS.INVOICE.CREATE), checkStockBeforeSale, (req, res) => {
//     res.status(200).json({ status: 'success', message: 'Stock validation passed', warnings: req.stockWarnings, stock: req.stockSummary });
// });

router.patch("/bulk/status", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.bulkUpdateStatus);
// router.post("/bulk/create", checkPermission(PERMISSIONS.INVOICE.CREATE), validateStockForInvoice, invoiceController.bulkCreateInvoices);
router.post("/bulk/cancel", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.bulkCancelInvoices);

router.get("/validate/number/:number", checkPermission(PERMISSIONS.INVOICE.CREATE), invoiceController.validateNumber);
router.get("/export/all", checkPermission(PERMISSIONS.INVOICE.EXPORT), invoiceController.exportInvoices);
router.get("/search/:query", checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.searchInvoices);

/* ======================================================
    3. DRAFTS, TRASH & RECURRING
====================================================== */

router.get("/drafts/all", checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getAllDrafts);
// router.delete("/drafts/bulk", checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.bulkDeleteDrafts);
router.get("/trash/all", checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.getDeletedInvoices);

// router.post("/recurring", checkPermission(PERMISSIONS.INVOICE.CREATE), validateStockForInvoice, invoiceController.createRecurringInvoice);
// router.post("/recurring/generate", checkPermission(PERMISSIONS.INVOICE.CREATE), invoiceController.generateRecurringInvoices);

/* ======================================================
    4. CUSTOMER SPECIFIC (Before Root)
====================================================== */

router.get("/customer/:customerId/summary", checkPermission(PERMISSIONS.INVOICE.READ), invoiceReport.getCustomerInvoiceSummary);
router.get("/customer/:customerId", checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoicesByCustomer);

/* ======================================================
    5. MAIN CRUD & ID-BASED (Must be Last)
====================================================== */

router.route("/")
  .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getAllInvoices)
  .post(checkPermission(PERMISSIONS.INVOICE.CREATE), validateStockForInvoice, invoiceController.createInvoice);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoice)
  .patch(checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.updateInvoice)
  .delete(checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.deleteInvoice);

// --- Specialized Actions ---
router.get("/:id/stock-info", checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoiceWithStock);
router.post("/:id/cancel", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.cancelInvoice);
router.post("/:id/convert", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.convertDraftToActive);
router.get("/:id/history", checkPermission(PERMISSIONS.INVOICE.READ), invoiceAudit.getInvoiceHistory);

// Payments
router.route("/:id/payments")
  .get(checkPermission(PERMISSIONS.INVOICE.READ), invoicePayment.getInvoicePayments)
  .post(checkPermission(PERMISSIONS.PAYMENT.CREATE), invoicePayment.addPayment);

// PDF & Comms
router.get("/:id/download", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoicePDFController.downloadInvoicePDF);
router.post("/:id/email", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoicePDFController.emailInvoice);
// router.get("/:id/qr-code", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoiceController.generateQRCode);

// Sync & Webhooks
router.post("/:id/restore", checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.restoreInvoice);
// router.post("/:id/webhook", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.triggerWebhook);
// router.post("/:id/sync/accounting", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.syncWithAccounting);

module.exports = router;
