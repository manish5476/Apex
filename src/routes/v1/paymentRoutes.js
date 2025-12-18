const express = require("express");
const router = express.Router();
const paymentController = require("../../controllers/paymentController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");
const { checkIdempotency } = require('../../middleware/idempotency'); // <--- IMPORT
router.use(authController.protect);

router.get("/customer/:customerId", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getPaymentsByCustomer);
router.get("/supplier/:supplierId", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getPaymentsBySupplier);
router.get("/:id/receipt/download", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.downloadReceipt);
router.post("/:id/receipt/email", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.emailReceipt);

router.route("/")
  .get(checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getAllPayments)
  .post(checkPermission(PERMISSIONS.PAYMENT.CREATE), checkIdempotency,paymentController.createPayment);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getPayment)
  .patch(checkPermission(PERMISSIONS.PAYMENT.CREATE), paymentController.updatePayment)
  .delete(checkPermission(PERMISSIONS.PAYMENT.DELETE), paymentController.deletePayment);

module.exports = router;
// const express = require("express");
// const paymentController = require("../../controllers/paymentController");
// const authController = require("../../controllers/authController");

// const router = express.Router();

// // protect all payment routes
// router.use(authController.protect);

// // Create payment (admins/employees can record; you may restrict)
// router.post(
//   "/",
//   authController.restrictTo("superadmin", "admin", "employee"),
//   paymentController.createPayment,
// );

// // List & create
// router.route("/").get(paymentController.getAllPayments);

// // convenience listings
// router.get("/customer/:customerId",
//   authController.restrictTo("superadmin", "admin"),
//   paymentController.getPaymentsByCustomer,
// );
// router.get("/supplier/:supplierId",
//   authController.restrictTo("superadmin", "admin"),
//   paymentController.getPaymentsBySupplier,
// );

// router.get("/:id/receipt/download", paymentController.downloadReceipt);
// router.post("/:id/receipt/email", paymentController.emailReceipt);

// // individual payment operations
// router.route("/:id")
//   .get(paymentController.getPayment)
//   .patch(authController.restrictTo("superadmin", "admin"), paymentController.updatePayment,)
//   .delete(authController.restrictTo("superadmin"),paymentController.deletePayment,);

// module.exports = router;
