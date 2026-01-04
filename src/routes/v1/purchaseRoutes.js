
const express = require("express");
const multer = require("multer");
const router = express.Router();
const purchaseController = require("../../modules/inventory/core/purchase.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
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


// const express = require("express");
// const multer = require("multer");
// const router = express.Router();
// const purchaseController = require("../../modules/inventory/core/purchase.controller");
// const authController = require("../../modules/auth/core/auth.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// // 10MB Limit for attachments (increased for GST bills)
// const upload = multer({ 
//   storage: multer.memoryStorage(), 
//   limits: { 
//     fileSize: 10 * 1024 * 1024, // 10MB
//     files: 5 // Max 5 files per upload
//   },
//   fileFilter: (req, file, cb) => {
//     // Accept only images and PDFs
//     if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
//       cb(null, true);
//     } else {
//       cb(new Error('Only images and PDF files are allowed'), false);
//     }
//   }
// });

// // ======================================================
// // 📊 ANALYTICS & REPORTS
// // ======================================================
// router.get("/analytics/summary", 
//   checkPermission(PERMISSIONS.PURCHASE.READ), 
//   purchaseController.getPurchaseAnalytics
// );

// // router.get("/analytics/supplier/:supplierId", 
// //   checkPermission(PERMISSIONS.PURCHASE.READ), 
// //   purchaseController.getSupplierPurchaseHistory
// // );

// // router.get("/reports/daily", 
// //   checkPermission(PERMISSIONS.PURCHASE.REPORT), 
// //   purchaseController.getDailyPurchaseReport
// // );

// // ======================================================
// // 💰 PAYMENT & FINANCE ROUTES (CRITICAL)
// // ======================================================
// router.post("/:id/payments", 
//   checkPermission(PERMISSIONS.PURCHASE.PAYMENT), 
//   purchaseController.recordPayment
// );

// router.delete("/:id/payments/:paymentId", 
//   checkPermission(PERMISSIONS.PURCHASE.PAYMENT), 
//   purchaseController.deletePayment
// );

// router.get("/:id/payments", 
//   checkPermission(PERMISSIONS.PURCHASE.READ), 
//   purchaseController.getPaymentHistory
// );

// router.post("/bulk-payments", 
//   checkPermission(PERMISSIONS.PURCHASE.PAYMENT), 
//   purchaseController.recordBulkPayments
// );

// // ======================================================
// // 🔄 RETURN & CANCELLATION ROUTES
// // ======================================================
// router.post("/:id/cancel", 
//   checkPermission(PERMISSIONS.PURCHASE.UPDATE), 
//   purchaseController.cancelPurchase
// );

// router.post("/:id/return", 
//   checkPermission(PERMISSIONS.PURCHASE.UPDATE), 
//   purchaseController.partialReturn
// );

// router.post("/:id/status", 
//   checkPermission(PERMISSIONS.PURCHASE.UPDATE), 
//   purchaseController.updateStatus
// );

// // ======================================================
// // 📎 ATTACHMENT ROUTES
// // ======================================================
// router.delete("/:id/attachments/:fileIndex", 
//   checkPermission(PERMISSIONS.PURCHASE.UPDATE), 
//   purchaseController.deleteAttachment
// );

// router.post("/:id/attachments", 
//   checkPermission(PERMISSIONS.PURCHASE.UPDATE), 
//   upload.array("files", 5), 
//   purchaseController.addAttachments
// );

// // ======================================================
// // 📋 BULK OPERATIONS
// // ======================================================
// router.post("/bulk/update", 
//   checkPermission(PERMISSIONS.PURCHASE.BULK), 
//   purchaseController.bulkUpdatePurchases
// );

// router.post("/bulk/status", 
//   checkPermission(PERMISSIONS.PURCHASE.BULK), 
//   purchaseController.bulkUpdatePurchaseStatus
// );

// // ======================================================
// // 🔍 SEARCH & FILTER ROUTES
// // ======================================================
// router.get("/search/supplier/:supplierId", 
//   checkPermission(PERMISSIONS.PURCHASE.READ), 
//   purchaseController.getPurchasesBySupplier
// );

// router.get("/filter/status/:status", 
//   checkPermission(PERMISSIONS.PURCHASE.READ), 
//   purchaseController.getPurchasesByStatus
// );

// router.get("/filter/date-range", 
//   checkPermission(PERMISSIONS.PURCHASE.READ), 
//   purchaseController.getPurchasesByDateRange
// );

// router.get("/filter/payment-status/:status", 
//   checkPermission(PERMISSIONS.PURCHASE.READ), 
//   purchaseController.getPurchasesByPaymentStatus
// );

// // ======================================================
// // 📄 CORE CRUD ROUTES
// // ======================================================
// router.route("/")
//   .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getAllPurchases)
//   .post(checkPermission(PERMISSIONS.PURCHASE.CREATE), upload.array("attachments", 5), purchaseController.createPurchase);

// router.route("/:id")
//   .get(checkPermission(PERMISSIONS.PURCHASE.READ), purchaseController.getPurchase)
//   .patch(checkPermission(PERMISSIONS.PURCHASE.UPDATE), upload.array("attachments", 5), purchaseController.updatePurchase)
//   .delete(checkPermission(PERMISSIONS.PURCHASE.DELETE), purchaseController.deletePurchase);

// // ======================================================
// // 📊 DASHBOARD & QUICK ACTIONS
// // ======================================================
// router.get("/dashboard/overview", 
//   checkPermission(PERMISSIONS.PURCHASE.READ), 
//   purchaseController.getDashboardOverview
// );

// router.get("/pending/payments", 
//   checkPermission(PERMISSIONS.PURCHASE.READ), 
//   purchaseController.getPendingPayments
// );

// router.get("/upcoming/due", 
//   checkPermission(PERMISSIONS.PURCHASE.READ), 
//   purchaseController.getUpcomingDuePurchases
// );

// // ======================================================
// // 📤 EXPORT ROUTES
// // ======================================================
// router.get("/export/csv", 
//   checkPermission(PERMISSIONS.PURCHASE.EXPORT), 
//   purchaseController.exportPurchasesCSV
// );

// router.get("/export/pdf/:id", 
//   checkPermission(PERMISSIONS.PURCHASE.EXPORT), 
//   purchaseController.exportPurchasePDF
// );

// module.exports = router;
