const express = require("express");
const router = express.Router();

const ledgerController = require("../../controllers/ledgerController");
const authController = require("../../controllers/authController");
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


// const express = require("express");
// const router = express.Router();

// const ledgerController = require("../../controllers/ledgerController");
// const authController = require("../../controllers/authController");
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// // Protect all routes
// router.use(authController.protect);

// /* ---------------------------------------------------------
//    JOURNAL & PAGINATION
//    GET /api/v1/ledgers
// --------------------------------------------------------- */
// router.get(
//   "/",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.getAllLedgers
// );

// /* ---------------------------------------------------------
//    EXPORT LEDGERS (Excel)
//    GET /api/v1/ledgers/export
// --------------------------------------------------------- */
// router.get(
//   "/export",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.exportLedgers
// );

// /* ---------------------------------------------------------
//    CUSTOMER LEDGER STATEMENT
//    GET /api/v1/ledgers/customer/:customerId
// --------------------------------------------------------- */
// router.get(
//   "/customer/:customerId",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.getCustomerLedger
// );

// /* ---------------------------------------------------------
//    SUPPLIER LEDGER STATEMENT
//    GET /api/v1/ledgers/supplier/:supplierId
// --------------------------------------------------------- */
// router.get(
//   "/supplier/:supplierId",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.getSupplierLedger
// );

// /* ---------------------------------------------------------
//    ORGANIZATION SUMMARY (by account type)
//    GET /api/v1/ledgers/summary/org
// --------------------------------------------------------- */
// router.get(
//   "/summary/org",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.getOrganizationLedgerSummary
// );

// /* ---------------------------------------------------------
//    TRIAL BALANCE
//    GET /api/v1/ledgers/summary/trial-balance
// --------------------------------------------------------- */
// router.get(
//   "/summary/trial-balance",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.getTrialBalance
// );

// /* ---------------------------------------------------------
//    PROFIT & LOSS
//    GET /api/v1/ledgers/summary/profit-loss
// --------------------------------------------------------- */
// router.get(
//   "/summary/profit-loss",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.getProfitAndLoss
// );

// /* ---------------------------------------------------------
//    BALANCE SHEET
//    GET /api/v1/ledgers/summary/balance-sheet
// --------------------------------------------------------- */
// router.get(
//   "/summary/balance-sheet",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.getBalanceSheet
// );

// /* ---------------------------------------------------------
//    RETAINED EARNINGS
//    GET /api/v1/ledgers/summary/retained-earnings
// --------------------------------------------------------- */
// router.get(
//   "/summary/retained-earnings",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.getRetainedEarnings
// );

// /* ---------------------------------------------------------
//    ACCOUNT DRILL DOWN
//    GET /api/v1/ledgers/account/:accountId
// --------------------------------------------------------- */
// router.get(
//   "/account/:accountId",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.getAccountDrillDown
// );

// /* ---------------------------------------------------------
//    CASH FLOW
//    GET /api/v1/ledgers/cash-flow
// --------------------------------------------------------- */
// router.get(
//   "/cash-flow",
//   checkPermission(PERMISSIONS.LEDGER.READ),
//   ledgerController.getCashFlow
// );

// /* ---------------------------------------------------------
//    SINGLE LEDGER ENTRY
//    GET /api/v1/ledgers/:id
//    DELETE /api/v1/ledgers/:id
// --------------------------------------------------------- */
// router
//   .route("/:id")
//   .get(
//     checkPermission(PERMISSIONS.LEDGER.READ),
//     ledgerController.getLedger
//   )
//   .delete(
//     checkPermission(PERMISSIONS.LEDGER.DELETE),
//     ledgerController.deleteLedger
//   );

// module.exports = router;
