const express = require("express");
const multer = require("multer");
const router = express.Router();
const purchaseController = require("../../modules/inventory/core/purchase.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.delete("/:id/attachments/:fileIndex", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.deleteAttachment);
router.post("/:id/cancel", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.cancelPurchase);

// CRUD
router.route("/")
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllPurchases)
  .post(checkPermission(PERMISSIONS.PURCHASE.CREATE), upload.array("attachments", 10), purchaseController.createPurchase);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPurchase)
  .patch(checkPermission(PERMISSIONS.PURCHASE.UPDATE), upload.array("attachments", 10), purchaseController.updatePurchase)
  .delete(checkPermission(PERMISSIONS.PURCHASE.DELETE), purchaseController.deletePurchase);

  // 2. Record Payment (Outflow)
router.post(
  "/:id/payments",
  checkPermission(PERMISSIONS.PURCHASE.CREATE_PAYMENT || PERMISSIONS.PAYMENT.CREATE), // Ensure this permission exists
  purchaseController.recordPayment
);

// 3. Partial Return (Debit Note)
router.post(
  "/:id/return",
  checkPermission(PERMISSIONS.PURCHASE.RETURN),
  purchaseController.partialReturn
);

// GET /api/v1/purchase-returns
router.get(
  "/purchaseReturn",
  checkPermission(PERMISSIONS.PURCHASE.READ), // Reusing Purchase Read permission
  purchaseController.getAllReturns
);

// GET /api/v1/purchase-returns/:id
router.get(
  "/purchaseReturn/:id",
  checkPermission(PERMISSIONS.PURCHASE.READ),
  purchaseController.getReturnById
);

module.exports = router;


// const express = require("express");
// const multer = require("multer");
// const router = express.Router();
// const purchaseController = require("../../modules/inventory/core/purchase.controller");
// const authController = require("../../modules/auth/core/auth.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);
// const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
// router.delete("/:id/attachments/:fileIndex", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.deleteAttachment);
// router.post("/:id/cancel", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.cancelPurchase);

// // CRUD
// router.route("/")
//   .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllPurchases)
//   .post(checkPermission(PERMISSIONS.PURCHASE.CREATE), upload.array("attachments", 10), purchaseController.createPurchase);

// router.route("/:id")
//   .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPurchase)
//   .patch(checkPermission(PERMISSIONS.PURCHASE.UPDATE), upload.array("attachments", 10), purchaseController.updatePurchase)
//   .delete(checkPermission(PERMISSIONS.PURCHASE.DELETE), purchaseController.deletePurchase);

//   // 2. Record Payment (Outflow)
// router.post(
//   "/:id/payments",
//   checkPermission(PERMISSIONS.PURCHASE.CREATE_PAYMENT || PERMISSIONS.PAYMENT.CREATE), // Ensure this permission exists
//   purchaseController.recordPayment
// );

// // 3. Partial Return (Debit Note)
// router.post(
//   "/:id/return",
//   checkPermission(PERMISSIONS.PURCHASE.RETURN),
//   purchaseController.partialReturn
// );

// // GET /api/v1/purchase-returns
// router.get(
//   "/purchaseReturn",
//   checkPermission(PERMISSIONS.PURCHASE.READ), // Reusing Purchase Read permission
//   purchaseController.getAllReturns
// );

// // GET /api/v1/purchase-returns/:id
// router.get(
//   "/purchaseReturn/:id",
//   checkPermission(PERMISSIONS.PURCHASE.READ),
//   purchaseController.getReturnById
// );

// module.exports = router;
