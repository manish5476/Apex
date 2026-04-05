const express = require("express");
const multer = require("multer");
const router = express.Router();
const purchaseController = require("../../modules/inventory/core/purchase.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");
const rateLimit = require('express-rate-limit');

const financialLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many requests on financial endpoints'
});
// Protect all routes globally
router.use(authController.protect);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ==============================================================================
// 1. STATIC ROUTES (MUST BE BEFORE /:id)
// ==============================================================================

// ==============================================================================
// 1. STATIC ROUTES (MUST BE BEFORE /:id)
// ==============================================================================

// Analytics & Reports (Using granular analytics/payment permissions)
/** GET /analytics @payload none */
router.get("/analytics", checkPermission(PERMISSIONS.PURCHASE.ANALYTICS_VIEW), purchaseController.getPurchaseAnalytics);
/** GET /pending-payments @payload none */
router.get("/pending-payments", checkPermission(PERMISSIONS.PURCHASE.PAYMENT_VIEW), purchaseController.getPendingPayments);

// Purchase Returns (Static Prefixes)
/** GET /returns @payload none */
router.get("/returns", checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllReturns);
/** GET /returns/:id @params { id } @payload none */
router.get("/returns/:id", checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getReturnById);

// Bulk Operations
/**
 * PATCH /bulk-update
 * @payload { purchaseIds* (array), status* }
 */
router.patch("/bulk-update", checkPermission(PERMISSIONS.PURCHASE.BULK_UPDATE), purchaseController.bulkUpdatePurchases);

// ==============================================================================
// 2. ROOT ROUTES
// ==============================================================================
// ==============================================================================
// 2. ROOT ROUTES
// ==============================================================================
router.route("/")
  /**
   * GET /
   * @query { page, limit, status, etc }
   * @payload none
   */
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllPurchases)
  /**
   * POST /
   * @payload { supplierId*, items*, totalAmount*, attachments, etc }
   */
  .post(
    checkPermission(PERMISSIONS.PURCHASE.CREATE), 
    upload.array("attachments", 10), financialLimiter,
    purchaseController.createPurchase
  );

// ==============================================================================
// 3. ID-BASED ROUTES (Dynamic :id)
// ==============================================================================

// ==============================================================================
// 3. ID-BASED ROUTES (Dynamic :id)
// ==============================================================================

// Standard CRUD
router.route("/:id")
  /** GET /:id @params { id } @payload none */
  .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPurchase)
  /** PATCH /:id @params { id } @payload { status, items, etc } */
  .patch(
    checkPermission(PERMISSIONS.PURCHASE.UPDATE), 
    upload.array("attachments", 10), 
    purchaseController.updatePurchase
  )
  /** DELETE /:id @params { id } @payload none */
  .delete(checkPermission(PERMISSIONS.PURCHASE.DELETE), purchaseController.deletePurchase);

// Status Update (Using specific status permission)
/** PATCH /:id/status @params { id } @payload { status* } */
router.patch("/:id/status", checkPermission(PERMISSIONS.PURCHASE.STATUS_UPDATE), purchaseController.updateStatus);

// Attachments (Using specific attachment permissions)
/** POST /:id/attachments @params { id } @payload { attachments (files) } */
router.post(
  "/:id/attachments", 
  checkPermission(PERMISSIONS.PURCHASE.ATTACHMENT_UPLOAD), 
  upload.array("attachments", 5), 
  purchaseController.addAttachments
);
/** DELETE /:id/attachments/:fileIndex @params { id, fileIndex } @payload none */
router.delete(
  "/:id/attachments/:fileIndex", 
  checkPermission(PERMISSIONS.PURCHASE.ATTACHMENT_DELETE), 
  purchaseController.deleteAttachment
);

// Cancellation
/** POST /:id/cancel @params { id } @payload { reason } */
router.post("/:id/cancel", checkPermission(PERMISSIONS.PURCHASE.CANCEL), purchaseController.cancelPurchase);

// ==============================================================================
// 4. TRANSACTION ROUTES (Payments & Returns)
// ==============================================================================

// Record Payment
/** POST /:id/payments @params { id } @payload { amount*, paymentMethod*, etc } */
router.post("/:id/payments", checkPermission(PERMISSIONS.PURCHASE.CREATE_PAYMENT), purchaseController.recordPayment);

// Get Payment History
/** GET /:id/payments @params { id } @payload none */
router.get("/:id/payments", checkPermission(PERMISSIONS.PURCHASE.PAYMENT_VIEW), purchaseController.getPaymentHistory);

// Delete Payment (Fixed key to PAYMENT_DELETE)
/** DELETE /:id/payments/:paymentId @params { id, paymentId } @payload none */
router.delete("/:id/payments/:paymentId", checkPermission(PERMISSIONS.PURCHASE.PAYMENT_DELETE), purchaseController.deletePayment);

// Partial Return (Debit Note)
/** POST /:id/return @params { id } @payload { items*, returnReason } */
router.post("/:id/return", checkPermission(PERMISSIONS.PURCHASE.RETURN), purchaseController.partialReturn);

module.exports = router;
