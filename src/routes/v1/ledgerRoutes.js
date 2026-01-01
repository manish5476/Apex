const express = require("express");
const router = express.Router();

const ledgerController = require("../../controllers/ledgerController");
const authController = require("@modules/auth/core/auth.controller");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// list, export, statements etc
router.get("/", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getAllLedgers);

router.get("/export", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.exportLedgers);

router.get("/customer/:customerId", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getCustomerLedger);
router.get("/supplier/:supplierId", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getSupplierLedger);

router.get("/summary/org", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getOrganizationLedgerSummary);
router.get("/summary/trial-balance", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getTrialBalance);
router.get("/summary/profit-loss", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getProfitAndLoss);
router.get("/summary/balance-sheet", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getBalanceSheet);
router.get("/summary/retained-earnings", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getRetainedEarnings);

router.get("/account/:accountId", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getAccountDrillDown);
router.get("/cash-flow", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getCashFlow);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getLedger)
  .delete(checkPermission(PERMISSIONS.LEDGER.DELETE), ledgerController.deleteLedger);

module.exports = router;
