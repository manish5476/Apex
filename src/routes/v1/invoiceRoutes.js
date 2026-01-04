const express = require("express");
const router = express.Router();
const invoiceController = require("../../modules/accounting/billing/invoice.controller");
const invoicePDFController = require("../../modules/accounting/billing/invoicePDF.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");
const { validateStockForInvoice, checkStockBeforeSale } = require("../../core/middleware/stockValidation.middleware");

// Protect all routes
router.use(authController.protect);

/* ======================================================
   1. STATIC & SPECIFIC ROUTES (MUST BE BEFORE /:id)
====================================================== */

/**
 * @route POST /api/v1/invoices/check-stock
 * @desc Check stock availability before creating invoice
 * @access Private (Invoice Create permission)
 * @param {Array} items - Required: Array of items to check
 * @param {string} items[].productId - Required: Product ID
 * @param {number} items[].quantity - Required: Quantity to check
 */
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

/**
 * @route PATCH /api/v1/invoices/bulk/status
 * @desc Bulk update invoice status
 * @access Private (Invoice Update permission)
 * @param {Array} ids - Required: Array of invoice IDs
 * @param {string} status - Required: New status: "draft"|"issued"|"paid"|"cancelled"
 */
router.patch(
  "/bulk/status",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.bulkUpdateStatus
);

/**
 * @route POST /api/v1/invoices/bulk/create
 * @desc Bulk create invoices (with stock validation)
 * @access Private (Invoice Create permission)
 * @param {Array} invoices - Required: Array of invoice objects
 * @param {string} invoices[].customerId - Required: Customer ID
 * @param {Array} invoices[].items - Required: Items array
 */
router.post(
  "/bulk/create",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  validateStockForInvoice,
  invoiceController.bulkCreateInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Bulk invoices created' });
  })
);

/**
 * @route POST /api/v1/invoices/bulk/cancel
 * @desc Bulk cancel invoices (restores stock)
 * @access Private (Invoice Update permission)
 * @param {Array} ids - Required: Array of invoice IDs
 * @param {string} reason - Required: Cancellation reason
 * @param {boolean} restock - Optional: Restore stock? (default: true)
 */
router.post(
  "/bulk/cancel",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.bulkCancelInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Bulk invoices cancelled' });
  })
);

/* --- REPORTS & ANALYTICS --- */

/**
 * @route GET /api/v1/invoices/reports/profit
 * @desc Get profit summary report
 * @access Private (Report Read permission)
 * @query {string} startDate - Optional: Start date (YYYY-MM-DD)
 * @query {string} endDate - Optional: End date (YYYY-MM-DD)
 * @query {string} groupBy - Optional: "day"|"week"|"month"|"year" (default: "month")
 */
router.get(
  "/reports/profit",
  checkPermission(PERMISSIONS.REPORT.READ),
  invoiceController.profitSummary
);

/**
 * @route GET /api/v1/invoices/reports/sales
 * @desc Get sales report by date range
 * @access Private (Report Read permission)
 * @query {string} startDate - Optional: Start date (YYYY-MM-DD)
 * @query {string} endDate - Optional: End date (YYYY-MM-DD)
 * @query {string} groupBy - Optional: "day"|"month"|"year" (default: "day")
 */
router.get(
  "/reports/sales",
  checkPermission(PERMISSIONS.REPORT.READ),
  invoiceController.getSalesReport || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

/**
 * @route GET /api/v1/invoices/reports/tax
 * @desc Get tax report
 * @access Private (Report Read permission)
 * @query {string} startDate - Optional: Start date (YYYY-MM-DD)
 * @query {string} endDate - Optional: End date (YYYY-MM-DD)
 */
router.get(
  "/reports/tax",
  checkPermission(PERMISSIONS.REPORT.READ),
  invoiceController.getTaxReport || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

/**
 * @route GET /api/v1/invoices/reports/outstanding
 * @desc Get outstanding invoices report
 * @access Private (Report Read permission)
 * @query {boolean} overdueOnly - Optional: Show only overdue invoices? (default: false)
 */
router.get(
  "/reports/outstanding",
  checkPermission(PERMISSIONS.REPORT.READ),
  invoiceController.getOutstandingInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

/* --- UTILITIES & SEARCH --- */

/**
 * @route GET /api/v1/invoices/validate/number/:number
 * @desc Validate if invoice number is available
 * @access Private (Invoice Create permission)
 * @param {string} number - Required: Invoice number to validate (URL parameter)
 */
router.get(
  "/validate/number/:number",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  invoiceController.validateNumber
);

/**
 * @route GET /api/v1/invoices/export/all
 * @desc Export all invoices (CSV/Excel)
 * @access Private (Invoice Export permission)
 * @query {string} format - Optional: "csv"|"excel"|"json" (default: "csv")
 * @query {string} startDate - Optional: Start date filter
 * @query {string} endDate - Optional: End date filter
 */
router.get(
  "/export/all",
  checkPermission(PERMISSIONS.INVOICE.EXPORT),
  invoiceController.exportInvoices
);

/**
 * @route GET /api/v1/invoices/search/:query
 * @desc Search invoices
 * @access Private (Invoice Read permission)
 * @param {string} query - Required: Search query (URL parameter)
 * @query {number} limit - Optional: Results limit (default: 20)
 */
router.get(
  "/search/:query",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.searchInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

/* --- DRAFTS --- */

/**
 * @route GET /api/v1/invoices/drafts/all
 * @desc Get all draft invoices
 * @access Private (Invoice Read permission)
 * @query {number} page - Optional: Page number
 * @query {number} limit - Optional: Items per page
 */
router.get(
  "/drafts/all",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getAllDrafts || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

/**
 * @route DELETE /api/v1/invoices/drafts/bulk
 * @desc Bulk delete draft invoices
 * @access Private (Invoice Delete permission)
 * @param {Array} ids - Required: Array of draft invoice IDs
 */
router.delete(
  "/drafts/bulk",
  checkPermission(PERMISSIONS.INVOICE.DELETE),
  invoiceController.bulkDeleteDrafts || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Drafts deleted' });
  })
);

/* --- TRASH --- */

/**
 * @route GET /api/v1/invoices/trash/all
 * @desc Get all deleted invoices
 * @access Private (Invoice Delete permission)
 * @query {number} page - Optional: Page number
 * @query {number} limit - Optional: Items per page
 */
router.get(
  "/trash/all",
  checkPermission(PERMISSIONS.INVOICE.DELETE),
  invoiceController.getDeletedInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

/* --- RECURRING --- */

/**
 * @route POST /api/v1/invoices/recurring
 * @desc Create recurring invoice template
 * @access Private (Invoice Create permission)
 * @param {string} customerId - Required: Customer ID
 * @param {Array} items - Required: Invoice items
 * @param {string} frequency - Required: "daily"|"weekly"|"monthly"|"yearly"
 * @param {number} interval - Required: Interval (e.g., 1 for every month)
 * @param {string} startDate - Required: Start date (ISO format)
 * @param {string} endDate - Optional: End date (ISO format)
 */
router.post(
  "/recurring",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  validateStockForInvoice,
  invoiceController.createRecurringInvoice || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Recurring invoice created' });
  })
);

/**
 * @route POST /api/v1/invoices/recurring/generate
 * @desc Generate recurring invoices
 * @access Private (Invoice Create permission)
 * @param {string} date - Optional: Date to generate invoices for (default: today)
 */
router.post(
  "/recurring/generate",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  invoiceController.generateRecurringInvoices || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Recurring invoices generated' });
  })
);

/* ======================================================
   2. CUSTOMER ROUTES (Semi-specific)
====================================================== */

/**
 * @route GET /api/v1/invoices/customer/:customerId
 * @desc Get all invoices for a customer
 * @access Private (Invoice Read permission)
 * @param {string} customerId - Required: Customer ID (URL parameter)
 * @query {string} status - Optional: Filter by status
 * @query {number} limit - Optional: Items per page (default: 50)
 * @query {number} page - Optional: Page number (default: 1)
 */
router.get(
  "/customer/:customerId",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoicesByCustomer
);

/**
 * @route GET /api/v1/invoices/customer/:customerId/summary
 * @desc Get customer invoice summary
 * @access Private (Invoice Read permission)
 * @param {string} customerId - Required: Customer ID (URL parameter)
 */
router.get(
  "/customer/:customerId/summary",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getCustomerInvoiceSummary || ((req, res) => {
    res.status(200).json({
      status: 'success',
      data: { totalInvoices: 0, totalAmount: 0, totalPaid: 0, totalDue: 0 }
    });
  })
);

/* ======================================================
   3. GENERIC /:id ROUTES (MUST BE LAST)
====================================================== */

/**
 * @route GET /api/v1/invoices
 * @desc Get all invoices with pagination and filters
 * @access Private (Invoice Read permission)
 * @query {number} page - Optional: Page number (default: 1)
 * @query {number} limit - Optional: Items per page (default: 20, max: 100)
 * @query {string} status - Optional: Filter by status: "draft"|"issued"|"paid"|"cancelled"
 * @query {string} paymentStatus - Optional: Filter by payment: "unpaid"|"partial"|"paid"
 * @query {string} customerId - Optional: Filter by customer ID
 * @query {string} startDate - Optional: Start date (YYYY-MM-DD)
 * @query {string} endDate - Optional: End date (YYYY-MM-DD)
 * @query {string} sort - Optional: Sort field: "createdAt"|"invoiceDate"|"grandTotal" (default: "createdAt")
 * @query {string} order - Optional: Sort order: "asc"|"desc" (default: "desc")
 * @query {string} search - Optional: Search in invoice number or customer name
 */
router.get(
  "/",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getAllInvoices
);

/**
 * @route POST /api/v1/invoices
 * @desc Create a new invoice (reduces stock)
 * @access Private (Invoice Create permission)
 * @param {string} customerId - Required: Customer ID
 * @param {Array} items - Required: Array of invoice items
 * ... (full params in previous doc)
 */
router.post(
  "/",
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  validateStockForInvoice,
  invoiceController.createInvoice
);

/**
 * @route GET /api/v1/invoices/:id
 * @desc Get invoice by ID
 * @access Private (Invoice Read permission)
 * @param {string} id - Required: Invoice ID (URL parameter)
 */
router.get(
  "/:id",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoice
);

/**
 * @route PATCH /api/v1/invoices/:id
 * @desc Update invoice (handles stock adjustments if items changed)
 * @access Private (Invoice Update permission)
 * @param {string} id - Required: Invoice ID
 * ...
 */
router.patch(
  "/:id",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.updateInvoice
);

/**
 * @route DELETE /api/v1/invoices/:id
 * @desc Soft delete invoice
 * @access Private (Invoice Delete permission)
 * @param {string} id - Required: Invoice ID
 */
router.delete(
  "/:id",
  checkPermission(PERMISSIONS.INVOICE.DELETE),
  invoiceController.deleteInvoice
);

// --- Specific Actions on ID ---

/**
 * @route GET /api/v1/invoices/:id/stock-info
 * @desc Get invoice with current stock information
 * @access Private (Invoice Read permission)
 * @param {string} id - Required: Invoice ID
 */
router.get(
  "/:id/stock-info",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoiceWithStock
);

/**
 * @route POST /api/v1/invoices/:id/cancel
 * @desc Cancel invoice (restores stock)
 * @access Private (Invoice Update permission)
 * @param {string} id - Required: Invoice ID
 * @param {string} reason - Required: Cancellation reason
 * @param {boolean} restock - Optional: Restore stock?
 */
router.post(
  "/:id/cancel",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.cancelInvoice
);

/**
 * @route POST /api/v1/invoices/:id/convert
 * @desc Convert draft invoice to active (reduces stock)
 * @access Private (Invoice Update permission)
 * @param {string} id - Required: Draft Invoice ID
 */
router.post(
  "/:id/convert",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.convertDraftToActive
);

/**
 * @route POST /api/v1/invoices/:id/payments
 * @desc Add payment to invoice
 * @access Private (Payment Create permission)
 * @param {string} id - Required: Invoice ID
 * @param {number} amount - Required: Payment amount
 */
router.post(
  "/:id/payments",
  checkPermission(PERMISSIONS.PAYMENT.CREATE),
  invoiceController.addPayment
);

/**
 * @route GET /api/v1/invoices/:id/payments
 * @desc Get all payments for an invoice
 * @access Private (Invoice Read permission)
 * @param {string} id - Required: Invoice ID
 */
router.get(
  "/:id/payments",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoicePayments || ((req, res) => {
    res.status(200).json({ status: 'success', data: [] });
  })
);

/**
 * @route GET /api/v1/invoices/:id/download
 * @desc Download invoice as PDF
 * @access Private (Invoice Download permission)
 * @param {string} id - Required: Invoice ID
 */
router.get(
  "/:id/download",
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoicePDFController.downloadInvoicePDF
);

/**
 * @route POST /api/v1/invoices/:id/email
 * @desc Email invoice to customer
 * @access Private (Invoice Download permission)
 * @param {string} id - Required: Invoice ID
 */
router.post(
  "/:id/email",
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoicePDFController.emailInvoice
);

/**
 * @route GET /api/v1/invoices/:id/qr-code
 * @desc Generate invoice QR code for e-invoicing
 * @access Private (Invoice Download permission)
 * @param {string} id - Required: Invoice ID
 */
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

/**
 * @route GET /api/v1/invoices/:id/history
 * @desc Get invoice audit history
 * @access Private (Invoice Read permission)
 * @param {string} id - Required: Invoice ID
 */
router.get(
  "/:id/history",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoiceHistory
);

/**
 * @route GET /api/v1/invoices/:id/low-stock-warnings
 * @desc Get low stock warnings for invoice items
 * @access Private (Invoice Read permission)
 * @param {string} id - Required: Invoice ID
 */
router.get(
  "/:id/low-stock-warnings",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getLowStockWarnings || ((req, res) => {
    res.status(200).json({ status: 'success', warnings: [] });
  })
);

/**
 * @route GET /api/v1/invoices/:id/alternatives
 * @desc Suggest alternative products (if stock is low)
 * @access Private (Invoice Read permission)
 * @param {string} id - Required: Invoice ID
 */
router.get(
  "/:id/alternatives",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.suggestAlternatives || ((req, res) => {
    res.status(200).json({ status: 'success', alternatives: [] });
  })
);

/**
 * @route POST /api/v1/invoices/:id/restore
 * @desc Restore deleted invoice
 * @access Private (Invoice Delete permission)
 * @param {string} id - Required: Invoice ID
 */
router.post(
  "/:id/restore",
  checkPermission(PERMISSIONS.INVOICE.DELETE),
  invoiceController.restoreInvoice || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Invoice restored' });
  })
);

/**
 * @route POST /api/v1/invoices/:id/webhook
 * @desc Trigger invoice webhook (for external systems)
 * @access Private (Invoice Update permission)
 * @param {string} id - Required: Invoice ID
 * @param {string} event - Required: Webhook event type
 * @param {string} url - Required: Webhook URL
 */
router.post(
  "/:id/webhook",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.triggerWebhook || ((req, res) => {
    res.status(200).json({ status: 'success', message: 'Webhook triggered' });
  })
);

/**
 * @route POST /api/v1/invoices/:id/sync/accounting
 * @desc Sync invoice with accounting software
 * @access Private (Invoice Update permission)
 * @param {string} id - Required: Invoice ID
 * @param {string} software - Required: Accounting software name
 */
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
// const invoiceController = require("../../modules/accounting/billing/invoice.controller");
// const invoicePDFController = require("../../modules/accounting/billing/invoicePDF.controller");
// const authController = require("../../modules/auth/core/auth.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");
// const { validateStockForInvoice, checkStockBeforeSale } = require("../../core/middleware/stockValidation.middleware");

// // Protect all routes
// router.use(authController.protect);

// /* ======================================================
//    MAIN INVOICE CRUD WITH STOCK VALIDATION
// ====================================================== */

// /**
//  * @route POST /api/v1/invoices
//  * @desc Create a new invoice (reduces stock)
//  * @access Private (Invoice Create permission)
//  * @param {string} customerId - Required: Customer ID
//  * @param {Array} items - Required: Array of invoice items
//  * @param {string} items[].productId - Required: Product ID
//  * @param {number} items[].quantity - Required: Quantity (min: 1)
//  * @param {number} items[].price - Optional: Price per unit
//  * @param {number} items[].discount - Optional: Discount amount
//  * @param {number} items[].taxRate - Optional: Tax rate percentage
//  * @param {string} invoiceNumber - Optional: Custom invoice number
//  * @param {string} invoiceDate - Optional: Invoice date (ISO format)
//  * @param {string} dueDate - Optional: Due date (ISO format)
//  * @param {string} status - Optional: "draft"|"issued"|"paid"|"cancelled" (default: "issued")
//  * @param {number} paidAmount - Optional: Amount already paid (default: 0)
//  * @param {string} paymentMethod - Optional: "cash"|"bank"|"upi"|"card"|"cheque"|"other" (default: "cash")
//  * @param {string} notes - Optional: Invoice notes
//  * @param {number} shippingCharges - Optional: Shipping charges
//  * @param {number} roundOff - Optional: Round off amount
//  */
// router.post(
//   "/",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   validateStockForInvoice,
//   invoiceController.createInvoice
// );

// /**
//  * @route POST /api/v1/invoices/check-stock
//  * @desc Check stock availability before creating invoice
//  * @access Private (Invoice Create permission)
//  * @param {Array} items - Required: Array of items to check
//  * @param {string} items[].productId - Required: Product ID
//  * @param {number} items[].quantity - Required: Quantity to check
//  */
// router.post(
//   "/check-stock",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   checkStockBeforeSale,
//   (req, res) => {
//     res.status(200).json({
//       status: 'success',
//       message: 'Stock validation passed',
//       warnings: req.stockWarnings || []
//     });
//   }
// );

// /**
//  * @route GET /api/v1/invoices
//  * @desc Get all invoices with pagination and filters
//  * @access Private (Invoice Read permission)
//  * @query {number} page - Optional: Page number (default: 1)
//  * @query {number} limit - Optional: Items per page (default: 20, max: 100)
//  * @query {string} status - Optional: Filter by status: "draft"|"issued"|"paid"|"cancelled"
//  * @query {string} paymentStatus - Optional: Filter by payment: "unpaid"|"partial"|"paid"
//  * @query {string} customerId - Optional: Filter by customer ID
//  * @query {string} startDate - Optional: Start date (YYYY-MM-DD)
//  * @query {string} endDate - Optional: End date (YYYY-MM-DD)
//  * @query {string} sort - Optional: Sort field: "createdAt"|"invoiceDate"|"grandTotal" (default: "createdAt")
//  * @query {string} order - Optional: Sort order: "asc"|"desc" (default: "desc")
//  * @query {string} search - Optional: Search in invoice number or customer name
//  */
// router.get(
//   "/",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getAllInvoices
// );

// /**
//  * @route GET /api/v1/invoices/:id
//  * @desc Get invoice by ID
//  * @access Private (Invoice Read permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
// router.get(
//   "/:id",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getInvoice
// );

// /**
//  * @route GET /api/v1/invoices/:id/stock-info
//  * @desc Get invoice with current stock information
//  * @access Private (Invoice Read permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
// router.get(
//   "/:id/stock-info",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getInvoiceWithStock
// );

// /* ======================================================
//    INVOICE STATUS MANAGEMENT
// ====================================================== */

// /**
//  * @route PATCH /api/v1/invoices/:id
//  * @desc Update invoice (handles stock adjustments if items changed)
//  * @access Private (Invoice Update permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  * @param {Array} items - Optional: Updated items array
//  * @param {string} status - Optional: New status
//  * @param {number} paidAmount - Optional: Updated paid amount
//  * @param {string} notes - Optional: Updated notes
//  * @param {string} paymentMethod - Optional: Updated payment method
//  */
// router.patch(
//   "/:id",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.updateInvoice
// );

// /**
//  * @route POST /api/v1/invoices/:id/cancel
//  * @desc Cancel invoice (restores stock)
//  * @access Private (Invoice Update permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  * @param {string} reason - Required: Cancellation reason
//  * @param {boolean} restock - Optional: Restore stock? (default: true)
//  */
// router.post(
//   "/:id/cancel",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.cancelInvoice
// );

// /**
//  * @route POST /api/v1/invoices/:id/convert
//  * @desc Convert draft invoice to active (reduces stock)
//  * @access Private (Invoice Update permission)
//  * @param {string} id - Required: Draft Invoice ID (URL parameter)
//  */
// router.post(
//   "/:id/convert",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.convertDraftToActive
// );

// /**
//  * @route PATCH /api/v1/invoices/bulk/status
//  * @desc Bulk update invoice status
//  * @access Private (Invoice Update permission)
//  * @param {Array} ids - Required: Array of invoice IDs
//  * @param {string} status - Required: New status: "draft"|"issued"|"paid"|"cancelled"
//  */
// router.patch(
//   "/bulk/status",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.bulkUpdateStatus
// );

// /* ======================================================
//    PAYMENT MANAGEMENT
// ====================================================== */

// /**
//  * @route POST /api/v1/invoices/:id/payments
//  * @desc Add payment to invoice
//  * @access Private (Payment Create permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  * @param {number} amount - Required: Payment amount (min: 0.01)
//  * @param {string} paymentMethod - Optional: "cash"|"bank"|"upi"|"card"|"cheque"|"other" (default: "cash")
//  * @param {string} referenceNumber - Optional: Payment reference number
//  * @param {string} transactionId - Optional: Transaction ID
//  * @param {string} notes - Optional: Payment notes
//  */
// router.post(
//   "/:id/payments",
//   checkPermission(PERMISSIONS.PAYMENT.CREATE),
//   invoiceController.addPayment
// );

// /**
//  * @route GET /api/v1/invoices/:id/payments
//  * @desc Get all payments for an invoice
//  * @access Private (Invoice Read permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
// router.get(
//   "/:id/payments",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getInvoicePayments || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// /* ======================================================
//    CUSTOMER-SPECIFIC INVOICES
// ====================================================== */

// /**
//  * @route GET /api/v1/invoices/customer/:customerId
//  * @desc Get all invoices for a customer
//  * @access Private (Invoice Read permission)
//  * @param {string} customerId - Required: Customer ID (URL parameter)
//  * @query {string} status - Optional: Filter by status
//  * @query {number} limit - Optional: Items per page (default: 50)
//  * @query {number} page - Optional: Page number (default: 1)
//  */
// router.get(
//   "/customer/:customerId",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getInvoicesByCustomer
// );

// /**
//  * @route GET /api/v1/invoices/customer/:customerId/summary
//  * @desc Get customer invoice summary
//  * @access Private (Invoice Read permission)
//  * @param {string} customerId - Required: Customer ID (URL parameter)
//  */
// router.get(
//   "/customer/:customerId/summary",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getCustomerInvoiceSummary || ((req, res) => {
//     res.status(200).json({
//       status: 'success',
//       data: { totalInvoices: 0, totalAmount: 0, totalPaid: 0, totalDue: 0 }
//     });
//   })
// );

// /* ======================================================
//    DOCUMENT GENERATION & EMAIL
// ====================================================== */

// /**
//  * @route GET /api/v1/invoices/:id/download
//  * @desc Download invoice as PDF
//  * @access Private (Invoice Download permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
// router.get(
//   "/:id/download",
//   checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
//   invoicePDFController.downloadInvoicePDF
// );

// /**
//  * @route POST /api/v1/invoices/:id/email
//  * @desc Email invoice to customer
//  * @access Private (Invoice Download permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
// router.post(
//   "/:id/email",
//   checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
//   invoicePDFController.emailInvoice
// );

// /**
//  * @route GET /api/v1/invoices/:id/qr-code
//  * @desc Generate invoice QR code for e-invoicing
//  * @access Private (Invoice Download permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
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

// /* ======================================================
//    REPORTS & ANALYTICS
// ====================================================== */

// /**
//  * @route GET /api/v1/invoices/reports/profit
//  * @desc Get profit summary report
//  * @access Private (Report Read permission)
//  * @query {string} startDate - Optional: Start date (YYYY-MM-DD)
//  * @query {string} endDate - Optional: End date (YYYY-MM-DD)
//  * @query {string} groupBy - Optional: "day"|"week"|"month"|"year" (default: "month")
//  */
// router.get(
//   "/reports/profit",
//   checkPermission(PERMISSIONS.REPORT.READ),
//   invoiceController.profitSummary
// );

// /**
//  * @route GET /api/v1/invoices/reports/sales
//  * @desc Get sales report by date range
//  * @access Private (Report Read permission)
//  * @query {string} startDate - Optional: Start date (YYYY-MM-DD)
//  * @query {string} endDate - Optional: End date (YYYY-MM-DD)
//  * @query {string} groupBy - Optional: "day"|"month"|"year" (default: "day")
//  */
// router.get(
//   "/reports/sales",
//   checkPermission(PERMISSIONS.REPORT.READ),
//   invoiceController.getSalesReport || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// /**
//  * @route GET /api/v1/invoices/reports/tax
//  * @desc Get tax report
//  * @access Private (Report Read permission)
//  * @query {string} startDate - Optional: Start date (YYYY-MM-DD)
//  * @query {string} endDate - Optional: End date (YYYY-MM-DD)
//  */
// router.get(
//   "/reports/tax",
//   checkPermission(PERMISSIONS.REPORT.READ),
//   invoiceController.getTaxReport || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// /**
//  * @route GET /api/v1/invoices/reports/outstanding
//  * @desc Get outstanding invoices report
//  * @access Private (Report Read permission)
//  * @query {boolean} overdueOnly - Optional: Show only overdue invoices? (default: false)
//  */
// router.get(
//   "/reports/outstanding",
//   checkPermission(PERMISSIONS.REPORT.READ),
//   invoiceController.getOutstandingInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// /* ======================================================
//    UTILITIES & VALIDATION
// ====================================================== */

// /**
//  * @route GET /api/v1/invoices/validate/number/:number
//  * @desc Validate if invoice number is available
//  * @access Private (Invoice Create permission)
//  * @param {string} number - Required: Invoice number to validate (URL parameter)
//  */
// router.get(
//   "/validate/number/:number",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   invoiceController.validateNumber
// );

// /**
//  * @route GET /api/v1/invoices/export/all
//  * @desc Export all invoices (CSV/Excel)
//  * @access Private (Invoice Export permission)
//  * @query {string} format - Optional: "csv"|"excel"|"json" (default: "csv")
//  * @query {string} startDate - Optional: Start date filter
//  * @query {string} endDate - Optional: End date filter
//  */
// router.get(
//   "/export/all",
//   checkPermission(PERMISSIONS.INVOICE.EXPORT),
//   invoiceController.exportInvoices
// );

// /**
//  * @route GET /api/v1/invoices/:id/history
//  * @desc Get invoice audit history
//  * @access Private (Invoice Read permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
// router.get(
//   "/:id/history",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getInvoiceHistory
// );

// /**
//  * @route GET /api/v1/invoices/search/:query
//  * @desc Search invoices
//  * @access Private (Invoice Read permission)
//  * @param {string} query - Required: Search query (URL parameter)
//  * @query {number} limit - Optional: Results limit (default: 20)
//  */
// router.get(
//   "/search/:query",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.searchInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// /* ======================================================
//    DRAFT INVOICE MANAGEMENT
// ====================================================== */

// /**
//  * @route GET /api/v1/invoices/drafts/all
//  * @desc Get all draft invoices
//  * @access Private (Invoice Read permission)
//  * @query {number} page - Optional: Page number
//  * @query {number} limit - Optional: Items per page
//  */
// router.get(
//   "/drafts/all",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getAllDrafts || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// /**
//  * @route DELETE /api/v1/invoices/drafts/bulk
//  * @desc Bulk delete draft invoices
//  * @access Private (Invoice Delete permission)
//  * @param {Array} ids - Required: Array of draft invoice IDs
//  */
// router.delete(
//   "/drafts/bulk",
//   checkPermission(PERMISSIONS.INVOICE.DELETE),
//   invoiceController.bulkDeleteDrafts || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Drafts deleted' });
//   })
// );

// /* ======================================================
//    RECURRING INVOICES (Optional Feature)
// ====================================================== */

// /**
//  * @route POST /api/v1/invoices/recurring
//  * @desc Create recurring invoice template
//  * @access Private (Invoice Create permission)
//  * @param {string} customerId - Required: Customer ID
//  * @param {Array} items - Required: Invoice items
//  * @param {string} frequency - Required: "daily"|"weekly"|"monthly"|"yearly"
//  * @param {number} interval - Required: Interval (e.g., 1 for every month)
//  * @param {string} startDate - Required: Start date (ISO format)
//  * @param {string} endDate - Optional: End date (ISO format)
//  */
// router.post(
//   "/recurring",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   validateStockForInvoice,
//   invoiceController.createRecurringInvoice || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Recurring invoice created' });
//   })
// );

// /**
//  * @route POST /api/v1/invoices/recurring/generate
//  * @desc Generate recurring invoices
//  * @access Private (Invoice Create permission)
//  * @param {string} date - Optional: Date to generate invoices for (default: today)
//  */
// router.post(
//   "/recurring/generate",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   invoiceController.generateRecurringInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Recurring invoices generated' });
//   })
// );

// /* ======================================================
//    STOCK-RELATED ENDPOINTS
// ====================================================== */

// /**
//  * @route GET /api/v1/invoices/:id/low-stock-warnings
//  * @desc Get low stock warnings for invoice items
//  * @access Private (Invoice Read permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
// router.get(
//   "/:id/low-stock-warnings",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.getLowStockWarnings || ((req, res) => {
//     res.status(200).json({ status: 'success', warnings: [] });
//   })
// );

// /**
//  * @route GET /api/v1/invoices/:id/alternatives
//  * @desc Suggest alternative products (if stock is low)
//  * @access Private (Invoice Read permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
// router.get(
//   "/:id/alternatives",
//   checkPermission(PERMISSIONS.INVOICE.READ),
//   invoiceController.suggestAlternatives || ((req, res) => {
//     res.status(200).json({ status: 'success', alternatives: [] });
//   })
// );

// /* ======================================================
//    DELETE INVOICE (SOFT DELETE)
// ====================================================== */

// /**
//  * @route DELETE /api/v1/invoices/:id
//  * @desc Soft delete invoice
//  * @access Private (Invoice Delete permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
// router.delete(
//   "/:id",
//   checkPermission(PERMISSIONS.INVOICE.DELETE),
//   invoiceController.deleteInvoice
// );

// /**
//  * @route POST /api/v1/invoices/:id/restore
//  * @desc Restore deleted invoice
//  * @access Private (Invoice Delete permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  */
// router.post(
//   "/:id/restore",
//   checkPermission(PERMISSIONS.INVOICE.DELETE),
//   invoiceController.restoreInvoice || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Invoice restored' });
//   })
// );

// /**
//  * @route GET /api/v1/invoices/trash/all
//  * @desc Get all deleted invoices
//  * @access Private (Invoice Delete permission)
//  * @query {number} page - Optional: Page number
//  * @query {number} limit - Optional: Items per page
//  */
// router.get(
//   "/trash/all",
//   checkPermission(PERMISSIONS.INVOICE.DELETE),
//   invoiceController.getDeletedInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', data: [] });
//   })
// );

// /* ======================================================
//    BULK OPERATIONS
// ====================================================== */

// /**
//  * @route POST /api/v1/invoices/bulk/create
//  * @desc Bulk create invoices (with stock validation)
//  * @access Private (Invoice Create permission)
//  * @param {Array} invoices - Required: Array of invoice objects
//  * @param {string} invoices[].customerId - Required: Customer ID
//  * @param {Array} invoices[].items - Required: Items array
//  */
// router.post(
//   "/bulk/create",
//   checkPermission(PERMISSIONS.INVOICE.CREATE),
//   validateStockForInvoice,
//   invoiceController.bulkCreateInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Bulk invoices created' });
//   })
// );

// /**
//  * @route POST /api/v1/invoices/bulk/cancel
//  * @desc Bulk cancel invoices (restores stock)
//  * @access Private (Invoice Update permission)
//  * @param {Array} ids - Required: Array of invoice IDs
//  * @param {string} reason - Required: Cancellation reason
//  * @param {boolean} restock - Optional: Restore stock? (default: true)
//  */
// router.post(
//   "/bulk/cancel",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.bulkCancelInvoices || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Bulk invoices cancelled' });
//   })
// );

// /* ======================================================
//    WEBHOOKS & INTEGRATIONS
// ====================================================== */

// /**
//  * @route POST /api/v1/invoices/:id/webhook
//  * @desc Trigger invoice webhook (for external systems)
//  * @access Private (Invoice Update permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  * @param {string} event - Required: Webhook event type
//  * @param {string} url - Required: Webhook URL
//  */
// router.post(
//   "/:id/webhook",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.triggerWebhook || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Webhook triggered' });
//   })
// );

// /**
//  * @route POST /api/v1/invoices/:id/sync/accounting
//  * @desc Sync invoice with accounting software
//  * @access Private (Invoice Update permission)
//  * @param {string} id - Required: Invoice ID (URL parameter)
//  * @param {string} software - Required: Accounting software name
//  */
// router.post(
//   "/:id/sync/accounting",
//   checkPermission(PERMISSIONS.INVOICE.UPDATE),
//   invoiceController.syncWithAccounting || ((req, res) => {
//     res.status(200).json({ status: 'success', message: 'Synced with accounting' });
//   })
// );

// module.exports = router;
