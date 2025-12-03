const express = require("express");
const router = express.Router();
const ledgerController = require("../../controllers/ledgerController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get("/customer/:customerId", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getCustomerLedger);
router.get("/supplier/:supplierId", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getSupplierLedger);
router.get("/summary/org", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getOrganizationLedgerSummary);

router.route("/")
  .get(checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getAllLedgers);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getLedger)
  .delete(checkPermission(PERMISSIONS.LEDGER.DELETE), ledgerController.deleteLedger);

module.exports = router;

// const express = require("express");
// const ledgerController = require("../../controllers/ledgerController");
// const authController = require("../../controllers/authController");

// const router = express.Router();

// /* ==========================================================
//  *  PROTECTED ROUTES
//  * ========================================================== */
// router.use(authController.protect);

// // View all ledger entries
// router
//   .route("/")
//   .get(
//     authController.restrictTo("superadmin", "admin"),
//     ledgerController.getAllLedgers,
//   );

// // Single ledger entry
// router
//   .route("/:id")
//   .get(ledgerController.getLedger)
//   .delete(
//     authController.restrictTo("platform-admin"),
//     ledgerController.deleteLedger,
//   );

// // Ledgers per customer/supplier
// router.get(
//   "/customer/:customerId",
//   authController.restrictTo("superadmin", "admin"),
//   ledgerController.getCustomerLedger,
// );

// router.get(
//   "/supplier/:supplierId",
//   authController.restrictTo("superadmin", "admin"),
//   ledgerController.getSupplierLedger,
// );

// // Organization-wide income/expense summary
// router.get(
//   "/summary/org",
//   authController.restrictTo("superadmin", "admin"),
//   ledgerController.getOrganizationLedgerSummary,
// );

// module.exports = router;
