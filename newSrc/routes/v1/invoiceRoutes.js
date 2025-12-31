const express = require("express");
const router = express.Router();
const invoiceController = require("../../controllers/invoiceController");
const invoicePDFController = require("../../controllers/invoicePDFController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");
router.use(authController.protect);
// PDF & Email
router.get("/:id/download",
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoicePDFController.downloadInvoicePDF
);

router.post("/:id/email",
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoicePDFController.emailInvoice
);

// Utilities
router.get('/validate-number/:number',
  checkPermission(PERMISSIONS.INVOICE.CREATE),
  invoiceController.validateNumber
);

router.get('/export',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.exportInvoices
);

router.get('/profit-summary',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.profitSummary
);

router.get('/:id/history',
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoiceHistory
);

router.get("/customer/:customerId",
  checkPermission(PERMISSIONS.INVOICE.READ),
  invoiceController.getInvoicesByCustomer
);

// Critical actions
router.post("/:id/cancel",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.cancelInvoice
);

router.patch("/bulk-status",
  checkPermission(PERMISSIONS.INVOICE.UPDATE),
  invoiceController.bulkUpdateStatus
);

// CRUD
router.route("/")
  .post(checkPermission(PERMISSIONS.INVOICE.CREATE), invoiceController.createInvoice)
  .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getAllInvoices);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoice)
  .patch(checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.updateInvoice)
  .delete(checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.deleteInvoice);

module.exports = router;


// const express = require("express");
// const router = express.Router();
// const invoiceController = require("../../controllers/invoiceController");
// const invoicePDFController = require("../../controllers/invoicePDFController");
// const authController = require("../../controllers/authController");
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// // PDF & Email
// router.get("/:id/download", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoicePDFController.downloadInvoicePDF);
// router.post("/:id/email", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoicePDFController.emailInvoice);

// // Utilities
// router.get('/validate-number/:number', checkPermission(PERMISSIONS.INVOICE.CREATE), invoiceController.validateNumber);
// router.get('/export', checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.exportInvoices);
// router.get('/profit-summary', checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.profitSummary);
// router.get('/:id/history', checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoiceHistory);
// router.get("/customer/:customerId", checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoicesByCustomer);

// // ✅ MISSING CRITICAL ACTION
// router.post("/:id/cancel", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.cancelInvoice);
// router.patch("/bulk-status", checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.bulkUpdateStatus);

// // CRUD
// router.route("/")
//   .post(checkPermission(PERMISSIONS.INVOICE.CREATE), invoiceController.createInvoice)
//   .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getAllInvoices);

// router.route("/:id")
//   .get(checkPermission(PERMISSIONS.INVOICE.READ), invoiceController.getInvoice)
//   .patch(checkPermission(PERMISSIONS.INVOICE.UPDATE), invoiceController.updateInvoice)
//   .delete(checkPermission(PERMISSIONS.INVOICE.DELETE), invoiceController.deleteInvoice);

// module.exports = router;