const express = require("express");
const router = express.Router();
const paymentController = require("../../controllers/paymentController");
const authController = require("@modules/auth/core/auth.controller");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get("/customer/:customerId", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getPaymentsByCustomer);
router.get("/supplier/:supplierId", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getPaymentsBySupplier);
router.get("/:id/receipt/download", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.downloadReceipt);
router.post("/:id/receipt/email", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.emailReceipt);

router.route("/")
  .get(checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getAllPayments)
  .post(checkPermission(PERMISSIONS.PAYMENT.CREATE), paymentController.createPayment);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getPayment)
  .patch(checkPermission(PERMISSIONS.PAYMENT.CREATE), paymentController.updatePayment)
  .delete(checkPermission(PERMISSIONS.PAYMENT.DELETE), paymentController.deletePayment);

module.exports = router;