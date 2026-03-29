const express = require("express");
const router = express.Router();
const authController = require("../../modules/auth/core/auth.controller");
const invoicePDFController = require("../../modules/accounting/billing/invoicePDF.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// INVOICE OUTPUT OPERATIONS
// ======================================================

// Generate and Download PDF
router.get(
  "/:id/download",
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoicePDFController.downloadInvoicePDF
);

// Send Invoice PDF via Email
router.post(
  "/:id/email",
  checkPermission(PERMISSIONS.INVOICE.DOWNLOAD),
  invoicePDFController.emailInvoice
);

module.exports = router;