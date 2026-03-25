const express = require("express");
const multer = require("multer");
const router = express.Router();
const purchaseController = require("../../modules/inventory/core/purchase.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ==============================================================================
// 1. STATIC ROUTES (MUST BE BEFORE /:id)
// ==============================================================================

// Analytics & Reports (Using granular analytics/payment permissions)
router.get("/analytics", checkPermission(PERMISSIONS.PURCHASE.ANALYTICS_VIEW), purchaseController.getPurchaseAnalytics);
router.get("/pending-payments", checkPermission(PERMISSIONS.PURCHASE.PAYMENT_VIEW), purchaseController.getPendingPayments);

// Purchase Returns (Static Prefixes)
router.get("/returns", checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllReturns);
router.get("/returns/:id", checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getReturnById);

// Bulk Operations
router.patch("/bulk-update", checkPermission(PERMISSIONS.PURCHASE.BULK_UPDATE), purchaseController.bulkUpdatePurchases);

// ==============================================================================
// 2. ROOT ROUTES
// ==============================================================================
router.route("/")
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllPurchases)
  .post(
    checkPermission(PERMISSIONS.PURCHASE.CREATE), 
    upload.array("attachments", 10), 
    purchaseController.createPurchase
  );

// ==============================================================================
// 3. ID-BASED ROUTES (Dynamic :id)
// ==============================================================================

// Standard CRUD
router.route("/:id")
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPurchase)
  .patch(
    checkPermission(PERMISSIONS.PURCHASE.UPDATE), 
    upload.array("attachments", 10), 
    purchaseController.updatePurchase
  )
  .delete(checkPermission(PERMISSIONS.PURCHASE.DELETE), purchaseController.deletePurchase);

// Status Update (Using specific status permission)
router.patch("/:id/status", checkPermission(PERMISSIONS.PURCHASE.STATUS_UPDATE), purchaseController.updateStatus);

// Attachments (Using specific attachment permissions)
router.post(
  "/:id/attachments", 
  checkPermission(PERMISSIONS.PURCHASE.ATTACHMENT_UPLOAD), 
  upload.array("attachments", 5), 
  purchaseController.addAttachments
);
router.delete(
  "/:id/attachments/:fileIndex", 
  checkPermission(PERMISSIONS.PURCHASE.ATTACHMENT_DELETE), 
  purchaseController.deleteAttachment
);

// Cancellation
router.post("/:id/cancel", checkPermission(PERMISSIONS.PURCHASE.CANCEL), purchaseController.cancelPurchase);

// ==============================================================================
// 4. TRANSACTION ROUTES (Payments & Returns)
// ==============================================================================

// Record Payment
router.post("/:id/payments", checkPermission(PERMISSIONS.PURCHASE.CREATE_PAYMENT), purchaseController.recordPayment);

// Get Payment History
router.get("/:id/payments", checkPermission(PERMISSIONS.PURCHASE.PAYMENT_VIEW), purchaseController.getPaymentHistory);

// Delete Payment (Fixed key to PAYMENT_DELETE)
router.delete("/:id/payments/:paymentId", checkPermission(PERMISSIONS.PURCHASE.PAYMENT_DELETE), purchaseController.deletePayment);

// Partial Return (Debit Note)
router.post("/:id/return", checkPermission(PERMISSIONS.PURCHASE.RETURN), purchaseController.partialReturn);

module.exports = router;
