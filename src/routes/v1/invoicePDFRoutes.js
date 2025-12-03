// Note: This file seems redundant if logic is in invoiceRoutes, 
// but sticking to your structure.
const express = require("express");
const authController = require("../../controllers/authController");
const invoicePDFController = require("../../controllers/invoicePDFController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

const router = express.Router();
router.use(authController.protect);

router.get("/:id/download", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoicePDFController.downloadInvoicePDF);
router.post("/:id/email", checkPermission(PERMISSIONS.INVOICE.DOWNLOAD), invoicePDFController.emailInvoice);

module.exports = router;

// // src/routes/invoicePDFRoutes.js
// const express = require("express");
// const authController = require("../../controllers/authController");
// const invoicePDFController = require("../../controllers/invoicePDFController");

// const router = express.Router();
// router.use(authController.protect);
// // FIXED: Changed .generateInvoicePDF -> .downloadInvoicePDF
// router.get("/:id/download", invoicePDFController.downloadInvoicePDF);
// // FIXED: Changed .sendInvoiceEmail -> .emailInvoice
// router.post("/:id/email", invoicePDFController.emailInvoice);
// module.exports = router;
