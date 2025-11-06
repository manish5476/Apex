const express = require("express");
const ledgerController = require("../../controllers/ledgerController");
const authController = require("../../controllers/authController");

const router = express.Router();

/* ==========================================================
 *  PROTECTED ROUTES
 * ========================================================== */
router.use(authController.protect);

// View all ledger entries
router
  .route("/")
  .get(
    authController.restrictTo("superadmin", "admin"),
    ledgerController.getAllLedgers,
  );

// Single ledger entry
router
  .route("/:id")
  .get(ledgerController.getLedger)
  .delete(
    authController.restrictTo("platform-admin"),
    ledgerController.deleteLedger,
  );

// Ledgers per customer/supplier
router.get(
  "/customer/:customerId",
  authController.restrictTo("superadmin", "admin"),
  ledgerController.getCustomerLedger,
);

router.get(
  "/supplier/:supplierId",
  authController.restrictTo("superadmin", "admin"),
  ledgerController.getSupplierLedger,
);

// Organization-wide income/expense summary
router.get(
  "/summary/org",
  authController.restrictTo("superadmin", "admin"),
  ledgerController.getOrganizationLedgerSummary,
);

module.exports = router;
