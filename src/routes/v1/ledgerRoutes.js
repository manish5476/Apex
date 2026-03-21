const express = require("express");
const router = express.Router();

const ledgerController = require("../../modules/accounting/core/ledger.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. ANALYTICS & STATEMENTS (Static Routes)
// ======================================================

// Specialized Reports
router.get("/summary/org", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getOrganizationLedgerSummary);
router.get("/summary/trial-balance", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getTrialBalance);
router.get("/summary/profit-loss", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getProfitAndLoss);
router.get("/summary/balance-sheet", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getBalanceSheet);
router.get("/summary/retained-earnings", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getRetainedEarnings);
router.get("/cash-flow", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getCashFlow);

// Party-Specific Ledgers
router.get("/customer/:customerId", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getCustomerLedger);
router.get("/supplier/:supplierId", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getSupplierLedger);

// Export & Search
router.get("/export", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.exportLedgers);
router.get("/account/:accountId", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getAccountDrillDown);

// ======================================================
// 2. CORE CRUD & ROOT
// ======================================================

// List all (Root)
router.get("/", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getAllLedgers);

// ID-Based operations (Must be last)
router.route("/:id")
  .get(checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getLedger)
  .delete(checkPermission(PERMISSIONS.LEDGER.DELETE), ledgerController.deleteLedger);

module.exports = router;