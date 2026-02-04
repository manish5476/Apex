const express = require("express");
const router = express.Router();
const authController = require("../../modules/auth/core/auth.controller");
const invoicePDFController = require("../../modules/accounting/billing/invoicePDF.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
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

// const express = require("express");
// const router = express.Router();
// const authController = require("../../modules/auth/core/auth.controller");
// const invoicePDFController = require("../../modules/accounting/billing/invoicePDF.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

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

// module.exports = router;
