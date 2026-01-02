const express = require("express");
const router = express.Router();
const emiController = require("../../modules/accounting/payments/emi.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes
router.use(authController.protect);

/* ======================================================
   EMI PAYMENT
====================================================== */
router.patch(
  "/pay",
  checkPermission(PERMISSIONS.EMI.PAY),
  emiController.payEmiInstallment
);

/* ======================================================
   GET EMI BY INVOICE
====================================================== */
router.get(
  "/invoice/:invoiceId",
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiByInvoice
);

/* ======================================================
   GET EMI INSTALLMENT HISTORY
====================================================== */
router.get(
  "/:id/history",
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiHistory
);

/* ======================================================
   CRUD: EMI
====================================================== */
router
  .route("/")
  .get(checkPermission(PERMISSIONS.EMI.READ), emiController.getAllEmis)
  .post(checkPermission(PERMISSIONS.EMI.CREATE), emiController.createEmiPlan);

router
  .route("/:id")
  .get(checkPermission(PERMISSIONS.EMI.READ), emiController.getEmiById)
  .delete(checkPermission(PERMISSIONS.EMI.CREATE), emiController.deleteEmi);

/* ======================================================
   EMI LEDGER REPORT
====================================================== */
router.get(
  "/reports/ledger",
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiLedgerReport
);

/* ======================================================
   EMI ANALYTICS / SUMMARY
====================================================== */
router.get(
  "/analytics/summary",
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiAnalytics
);

/* ======================================================
   MARK OVERDUE INSTALLMENTS (Admin/System Only)
====================================================== */
router.patch(
  "/mark-overdue",
  checkPermission(PERMISSIONS.EMI.MANAGE),
  emiController.markOverdueInstallments
);

module.exports = router;
 