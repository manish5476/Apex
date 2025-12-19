const express = require("express");
const router = express.Router();
const emiController = require("../../controllers/emiController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.patch("/pay", checkPermission(PERMISSIONS.EMI.PAY), emiController.payEmiInstallment);
router.get("/invoice/:invoiceId", checkPermission(PERMISSIONS.EMI.READ), emiController.getEmiByInvoice);
router.get("/:id/history", checkPermission(PERMISSIONS.EMI.READ), emiController.getEmiHistory);

router.route("/")
  .get(checkPermission(PERMISSIONS.EMI.READ), emiController.getAllEmis)
  .post(checkPermission(PERMISSIONS.EMI.CREATE), emiController.createEmiPlan);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.EMI.READ), emiController.getEmiById)
  .delete(checkPermission(PERMISSIONS.EMI.CREATE), emiController.deleteEmi);

module.exports = router;
