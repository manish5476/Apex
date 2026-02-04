const express = require("express");
const router = express.Router();
const emiController = require("../../modules/accounting/payments/emi.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes
router.use(authController.protect);

/* ======================================================
   1. STATIC ROUTES (Must come before /:id)
====================================================== */

// Pay EMI Installment
router.patch(
  "/pay",
  checkPermission(PERMISSIONS.EMI.PAY),
  emiController.payEmiInstallment
);

// Mark Overdue (Admin/System)
router.patch(
  "/mark-overdue",
  checkPermission(PERMISSIONS.EMI.MANAGE),
  emiController.markOverdueInstallments
);

// Reports: Ledger
router.get(
  "/reports/ledger",
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiLedgerReport
);

// Analytics: Summary
router.get(
  "/analytics/summary",
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiAnalytics
);

/* ======================================================
   2. SPECIFIC PARAMETER ROUTES
====================================================== */

// Get EMIs by Invoice ID (Specific param context)
router.get(
  "/invoice/:invoiceId",
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiByInvoice
);

/* ======================================================
   3. GENERIC ID ROUTES (Must come last)
====================================================== */

// Get Installment History for a specific EMI Plan
// Placing this here is safe, but typically best kept near the standard /:id route
router.get(
  "/:id/history",
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiHistory
);

// Standard CRUD operations for EMI Plans
router
  .route("/")
  .get(checkPermission(PERMISSIONS.EMI.READ), emiController.getAllEmis)
  .post(checkPermission(PERMISSIONS.EMI.CREATE), emiController.createEmiPlan);

router
  .route("/:id") // This matches anything, so it stays at the bottom
  .get(checkPermission(PERMISSIONS.EMI.READ), emiController.getEmiById)
  .delete(checkPermission(PERMISSIONS.EMI.CREATE), emiController.deleteEmi);

module.exports = router;

// const express = require("express");
// const router = express.Router();
// const emiController = require("../../modules/accounting/payments/emi.controller");
// const authController = require("../../modules/auth/core/auth.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// // Protect all routes
// router.use(authController.protect);

// /* ======================================================
//    EMI PAYMENT
// ====================================================== */
// router.patch(
//   "/pay",
//   checkPermission(PERMISSIONS.EMI.PAY),
//   emiController.payEmiInstallment
// );

// /* ======================================================
//    GET EMI BY INVOICE
// ====================================================== */
// router.get(
//   "/invoice/:invoiceId",
//   checkPermission(PERMISSIONS.EMI.READ),
//   emiController.getEmiByInvoice
// );

// /* ======================================================
//    GET EMI INSTALLMENT HISTORY
// ====================================================== */
// router.get(
//   "/:id/history",
//   checkPermission(PERMISSIONS.EMI.READ),
//   emiController.getEmiHistory
// );

// /* ======================================================
//    CRUD: EMI
// ====================================================== */
// router
//   .route("/")
//   .get(checkPermission(PERMISSIONS.EMI.READ), emiController.getAllEmis)
//   .post(checkPermission(PERMISSIONS.EMI.CREATE), emiController.createEmiPlan);

// router
//   .route("/:id")
//   .get(checkPermission(PERMISSIONS.EMI.READ), emiController.getEmiById)
//   .delete(checkPermission(PERMISSIONS.EMI.CREATE), emiController.deleteEmi);

// /* ======================================================
//    EMI LEDGER REPORT
// ====================================================== */
// router.get(
//   "/reports/ledger",
//   checkPermission(PERMISSIONS.EMI.READ),
//   emiController.getEmiLedgerReport
// );

// /* ======================================================
//    EMI ANALYTICS / SUMMARY
// ====================================================== */
// router.get(
//   "/analytics/summary",
//   checkPermission(PERMISSIONS.EMI.READ),
//   emiController.getEmiAnalytics
// );

// /* ======================================================
//    MARK OVERDUE INSTALLMENTS (Admin/System Only)
// ====================================================== */
// router.patch(
//   "/mark-overdue",
//   checkPermission(PERMISSIONS.EMI.MANAGE),
//   emiController.markOverdueInstallments
// );

// module.exports = router;
 