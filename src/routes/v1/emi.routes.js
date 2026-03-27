'use strict';

/**
 * EMI Routes  — mounted at /api/v1/emi
 */

const express = require('express');
const router = express.Router();

const emiController = require('../../modules/accounting/payments/emi.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

// ── All routes require authentication ────────────────────────
router.use(authController.protect);

/* ============================================================
   STATIC / UTILITY ROUTES  (before /:id)
   ============================================================ */

// Analytics & admin ops
router.get('/analytics',
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiAnalytics
);
router.get('/ledger',
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiLedgerReport
);
router.post('/mark-overdue',
  checkPermission(PERMISSIONS.EMI.MANAGE),
  emiController.markOverdueInstallments
);

// Invoice-scoped EMI lookup
router.get('/invoice/:invoiceId',
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiByInvoice
);

/* ============================================================
   ROOT CRUD
   ============================================================ */
router.route('/')
  .get(
    checkPermission(PERMISSIONS.EMI.READ),
    emiController.getAllEmis
  )
  .post(
    checkPermission(PERMISSIONS.EMI.MANAGE),
    emiController.createEmiPlan
  );

/* ============================================================
   ID-BASED OPERATIONS  (must come after static routes)
   ============================================================ */
router.route('/:id')
  .get(
    checkPermission(PERMISSIONS.EMI.READ),
    emiController.getEmiById
  )
  .delete(
    checkPermission(PERMISSIONS.EMI.MANAGE),
    emiController.deleteEmi
  );

// Pay an installment
router.post('/:id/pay',
  checkPermission(PERMISSIONS.EMI.MANAGE),
  emiController.payEmiInstallment
);

// Installment history
router.get('/:id/history',
  checkPermission(PERMISSIONS.EMI.READ),
  emiController.getEmiHistory
);

// Apply advance balance to an installment
router.post('/:id/apply-advance',
  checkPermission(PERMISSIONS.EMI.MANAGE),
  emiController.applyAdvanceBalance
);

module.exports = router;

// const express = require("express");
// const router = express.Router();
// const emiController = require("../../modules/accounting/payments/emi.controller");
// const authController = require("../../modules/auth/core/auth.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// // Protect all routes globally
// router.use(authController.protect);

// // ======================================================
// // 1. STATIC ACTIONS & ANALYTICS (MUST BE FIRST)
// // ======================================================

// // Process an installment payment
// router.patch(
//   "/pay",
//   checkPermission(PERMISSIONS.EMI.PAY),
//   emiController.payEmiInstallment
// );

// // System/Admin action to run overdue checks
// router.patch(
//   "/mark-overdue",
//   checkPermission(PERMISSIONS.EMI.MANAGE),
//   emiController.markOverdueInstallments
// );

// // Financial Reports
// router.get("/reports/ledger", checkPermission(PERMISSIONS.EMI.READ), emiController.getEmiLedgerReport);
// router.get("/analytics/summary", checkPermission(PERMISSIONS.EMI.READ), emiController.getEmiAnalytics);

// // ======================================================
// // 2. CONTEXTUAL LOOKUPS
// // ======================================================

// // Find EMI plans linked to a specific Invoice
// router.get(
//   "/invoice/:invoiceId",
//   checkPermission(PERMISSIONS.EMI.READ),
//   emiController.getEmiByInvoice
// );

// // ======================================================
// // 3. CORE CRUD & HISTORY (ID-BASED)
// // ======================================================

// router.get("/:id/history", checkPermission(PERMISSIONS.EMI.READ), emiController.getEmiHistory);

// router.route("/")
//   .get(checkPermission(PERMISSIONS.EMI.READ), emiController.getAllEmis)
//   .post(checkPermission(PERMISSIONS.EMI.CREATE), emiController.createEmiPlan);

// router.route("/:id")
//   .get(checkPermission(PERMISSIONS.EMI.READ), emiController.getEmiById)
//   // Changed to MANAGE for safer destructive access control
//   .delete(checkPermission(PERMISSIONS.EMI.MANAGE), emiController.deleteEmi);

// module.exports = router;