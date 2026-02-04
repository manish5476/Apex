const express = require("express");
const router = express.Router();
const paymentController = require("../../modules/accounting/payments/payment.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
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
  .patch(checkPermission(PERMISSIONS.PAYMENT.UPDATE), paymentController.updatePayment) // Updated to correct permission
  .delete(checkPermission(PERMISSIONS.PAYMENT.DELETE), paymentController.deletePayment);

// In payment.routes.js, add:
router.get(
  '/customer/:customerId/summary',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getCustomerPaymentSummary
);

router.post(
  '/:paymentId/allocate/auto',
  checkPermission(PERMISSIONS.PAYMENT.CREATE),
  paymentController.autoAllocatePayment
);

router.post(
  '/:paymentId/allocate/manual',
  checkPermission(PERMISSIONS.PAYMENT.CREATE),
  paymentController.manualAllocatePayment
);

router.get(
  '/customer/:customerId/unallocated',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getUnallocatedPayments
);

router.get(
  '/reports/allocation',
  checkPermission(PERMISSIONS.PAYMENT.READ),
  paymentController.getAllocationReport
);

module.exports = router;

// const express = require("express");
// const router = express.Router();
// const paymentController = require("../../modules/accounting/payments/payment.controller");
// const authController = require("../../modules/auth/core/auth.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// router.get("/customer/:customerId", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getPaymentsByCustomer);
// router.get("/supplier/:supplierId", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getPaymentsBySupplier);
// router.get("/:id/receipt/download", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.downloadReceipt);
// router.post("/:id/receipt/email", checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.emailReceipt);

// router.route("/")
//   .get(checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getAllPayments)
//   .post(checkPermission(PERMISSIONS.PAYMENT.CREATE), paymentController.createPayment);

// router.route("/:id")
//   .get(checkPermission(PERMISSIONS.PAYMENT.READ), paymentController.getPayment)
//   .patch(checkPermission(PERMISSIONS.PAYMENT.CREATE), paymentController.updatePayment)
//   .delete(checkPermission(PERMISSIONS.PAYMENT.DELETE), paymentController.deletePayment);

//   // In payment.routes.js, add:
// router.get(
//   '/customer/:customerId/summary',
//   checkPermission(PERMISSIONS.PAYMENT.READ),
//   paymentController.getCustomerPaymentSummary
// );

// router.post(
//   '/:paymentId/allocate/auto',
//   checkPermission(PERMISSIONS.PAYMENT.CREATE),
//   paymentController.autoAllocatePayment
// );

// router.post(
//   '/:paymentId/allocate/manual',
//   checkPermission(PERMISSIONS.PAYMENT.CREATE),
//   paymentController.manualAllocatePayment
// );

// router.get(
//   '/customer/:customerId/unallocated',
//   checkPermission(PERMISSIONS.PAYMENT.READ),
//   paymentController.getUnallocatedPayments
// );

// router.get(
//   '/reports/allocation',
//   checkPermission(PERMISSIONS.PAYMENT.READ),
//   paymentController.getAllocationReport
// );

// module.exports = router;