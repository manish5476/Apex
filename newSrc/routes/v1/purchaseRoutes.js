const express = require("express");
const multer = require("multer");
const router = express.Router();
const purchaseController = require("../../controllers/purchaseController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// 5MB Limit for attachments
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Actions
router.delete("/:id/attachments/:fileIndex", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.deleteAttachment);

// ✅ MISSING CRITICAL ACTION
router.post("/:id/cancel", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.cancelPurchase);

// CRUD
router.route("/")
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllPurchases)
  .post(checkPermission(PERMISSIONS.PURCHASE.CREATE), upload.array("attachments", 10), purchaseController.createPurchase);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPurchase)
  .patch(checkPermission(PERMISSIONS.PURCHASE.UPDATE), upload.array("attachments", 10), purchaseController.updatePurchase)
  .delete(checkPermission(PERMISSIONS.PURCHASE.DELETE), purchaseController.deletePurchase);

module.exports = router;