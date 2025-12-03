const express = require("express");
const multer = require("multer");
const router = express.Router();
const purchaseController = require("../../controllers/purchaseController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.delete("/:id/attachments/:fileIndex", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.deleteAttachment);

router.route("/")
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllPurchases)
  .post(checkPermission(PERMISSIONS.PURCHASE.CREATE), upload.array("attachments", 10), purchaseController.createPurchase);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPurchase)
  .patch(checkPermission(PERMISSIONS.PURCHASE.UPDATE), upload.array("attachments", 10), purchaseController.updatePurchase)
  .delete(checkPermission(PERMISSIONS.PURCHASE.DELETE), purchaseController.deletePurchase);

module.exports = router;

// const express = require("express");
// const multer = require("multer");
// const purchaseController = require("../../controllers/purchaseController");
// const authController = require("../../controllers/authController");

// const router = express.Router();
// router.use(authController.protect);

// const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, });
// router
//   .route("/")
//   .get(authController.restrictTo("read_purchases"), purchaseController.getAllPurchases)
//   .post(authController.restrictTo("create_purchases"), upload.array("attachments", 10), purchaseController.createPurchase);
// router
//   .route("/:id")
//   .get(authController.restrictTo("read_purchases"), purchaseController.getPurchase)
//   .patch(authController.restrictTo("update_purchases"), upload.array("attachments", 10), purchaseController.updatePurchase)
//   .delete(authController.restrictTo("delete_purchases"), purchaseController.deletePurchase);

// // remove one attached file
// router.delete("/:id/attachments/:fileIndex", authController.restrictTo("update_purchases"), purchaseController.deleteAttachment);
// module.exports = router;

