const express = require("express");
const router = express.Router();
const authController = require("../../controllers/authController");
const invoicePDFController = require("../../controllers/invoicePDFController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

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

module.exports = router;
