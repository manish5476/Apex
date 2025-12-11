const express = require("express");
const router = express.Router();
const invoiceController = require("../../controllers/invoiceController");
const invoicePDFController = require("../../controllers/invoicePDFController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// PDF & Email
router.get("/:id/download", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoicePDFController.downloadInvoicePDF);
router.post("/:id/email", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoicePDFController.emailInvoice);

// Utilities
router.get('/validate-number/:number', checkPermission(PERMISSIONS.INVOICE.CREATE), invoiceController.validateNumber);
router.get('/export', checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.exportInvoices);
router.get('/profit-summary', checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.profitSummary);
router.get('/:id/history', checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoiceHistory);
router.get("/customer/:customerId", checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoicesByCustomer);

// CRUD
router.route("/")
  .post(checkPermission(PERMISSIONS.INVOICE.CREATE), invoiceController.createInvoice)
  .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getAllInvoices);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoice)
  .patch(checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.updateInvoice)
  .delete(checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.deleteInvoice);
router.patch("/bulk-status", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.bulkUpdateStatus);
module.exports = router;
// const express = require("express");
// const invoiceController = require("../../controllers/invoiceController");
// const invoicePDFController = require("../../controllers/invoicePDFController"); // ✅ For PDF + email
// const authController = require("../../controllers/authController");

// const router = express.Router();

// /* ==========================================================
//  *  PROTECTED ROUTES
//  * ========================================================== */
// router.use(authController.protect);

// /**
//  * @route   POST /api/v1/invoices
//  * @desc    Create a new invoice
//  * @access  Super Admin / Admin only
//  *
//  * @route   GET /api/v1/invoices
//  * @desc    Get all invoices (paginated + filtered)
//  * @access  Authorized users
//  */
// router
//   .route("/")
//   .post(
//     authController.restrictTo("superadmin", "admin"),
//     invoiceController.createInvoice,
//   )
//   .get(invoiceController.getAllInvoices);

// /**
//  * @route   GET /api/v1/invoices/customer/:customerId
//  * @desc    Get all invoices for a specific customer
//  * @access  Super Admin / Admin only
//  */
// router.get(
//   "/customer/:customerId",
//   authController.restrictTo("superadmin", "admin"),
//   invoiceController.getInvoicesByCustomer,
// );

// /**
//  * @route   GET /api/v1/invoices/:id
//  * @desc    Get a single invoice
//  * @access  Authorized users
//  *
//  * @route   PATCH /api/v1/invoices/:id
//  * @desc    Update invoice (admin only)
//  * @access  Super Admin / Admin only
//  *
//  * @route   DELETE /api/v1/invoices/:id
//  * @desc    Delete invoice
//  * @access  Super Admin only
//  */
// router
//   .route("/:id")
//   .get(invoiceController.getInvoice)
//   .patch(
//     authController.restrictTo("superadmin", "admin"),
//     invoiceController.updateInvoice,
//   )
//   .delete(
//     authController.restrictTo("superadmin"),
//     invoiceController.deleteInvoice,
//   );

// /* ==========================================================
//  *  PDF & EMAIL ROUTES
//  * ========================================================== */

// /**
//  * @route   GET /api/v1/invoices/:id/download
//  * @desc    Download invoice PDF
//  * @access  Authorized users
//  */
// router.get("/:id/download", invoicePDFController.downloadInvoicePDF);

// /**
//  * @route   POST /api/v1/invoices/:id/email
//  * @desc    Send invoice PDF to customer via email
//  * @access  Super Admin / Admin only
//  */
// router.post(
//   "/:id/email",
//   authController.restrictTo("superadmin", "admin"),
//   invoicePDFController.emailInvoice,
// );

// router.get('/validate-number/:number', authController.restrictTo('create_invoices','superadmin'), invoiceController.validateNumber);
// router.get('/export', authController.restrictTo('read_invoices','superadmin'), invoiceController.exportInvoices);
// router.get('/profit-summary', authController.restrictTo('read_invoices','superadmin'), invoiceController.profitSummary);
// router.get('/:id/history', authController.restrictTo('read_invoices','superadmin'), invoiceController.getInvoiceHistory);


// module.exports = router;
