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
router.get("/export", checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.exportLedgers);
router.route("/")
  .get(checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getAllLedgers);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.LEDGER.READ), ledgerController.getLedger)
  .delete(checkPermission(PERMISSIONS.LEDGER.DELETE), ledgerController.deleteLedger);

module.exports = router;
