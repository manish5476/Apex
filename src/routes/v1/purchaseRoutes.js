const express = require("express");
const multer = require("multer");
const router = express.Router();
const purchaseController = require("../../modules/inventory/core/purchase.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ==============================================================================
// 1. STATIC ROUTES (MUST BE BEFORE /:id)
// ==============================================================================

// Analytics & Reports
router.get("/analytics", checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPurchaseAnalytics);
router.get("/pending-payments", checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPendingPayments);

// Purchase Returns (Static Prefixes)
router.get("/returns", checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllReturns);
router.get("/returns/:id", checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getReturnById);

// Bulk Operations
router.patch("/bulk-update", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.bulkUpdatePurchases);

// ==============================================================================
// 2. ROOT ROUTES
// ==============================================================================
router.route("/")
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllPurchases)
  .post(checkPermission(PERMISSIONS.PURCHASE.CREATE), upload.array("attachments", 10), purchaseController.createPurchase);

// ==============================================================================
// 3. ID-BASED ROUTES (Dynamic :id)
// ==============================================================================

// Standard CRUD
router.route("/:id")
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPurchase)
  .patch(checkPermission(PERMISSIONS.PURCHASE.UPDATE), upload.array("attachments", 10), purchaseController.updatePurchase)
  .delete(checkPermission(PERMISSIONS.PURCHASE.DELETE), purchaseController.deletePurchase);

// Status Update
router.patch("/:id/status", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.updateStatus);

// Attachments
router.post("/:id/attachments", checkPermission(PERMISSIONS.PURCHASE.UPDATE), upload.array("attachments", 5), purchaseController.addAttachments);
router.delete("/:id/attachments/:fileIndex", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.deleteAttachment);

// Cancellation
router.post("/:id/cancel", checkPermission(PERMISSIONS.PURCHASE.UPDATE), purchaseController.cancelPurchase);

// ==============================================================================
// 4. TRANSACTION ROUTES (Payments & Returns)
// ==============================================================================

// Record Payment
router.post("/:id/payments", checkPermission(PERMISSIONS.PURCHASE.CREATE_PAYMENT), purchaseController.recordPayment);

// Get Payment History
router.get("/:id/payments", checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPaymentHistory);

// Delete Payment (Using specific paymentId)
router.delete("/:id/payments/:paymentId", checkPermission(PERMISSIONS.PURCHASE.DELETE_PAYMENT), purchaseController.deletePayment);

// Partial Return (Debit Note)
router.post("/:id/return", checkPermission(PERMISSIONS.PURCHASE.RETURN), purchaseController.partialReturn);

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
