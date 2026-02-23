const express = require("express");
const router = express.Router();
const productController = require("../../modules/inventory/core/product.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");
const { upload } = require("../../core/middleware/upload.middleware");

// Protect all routes globally
router.use(authController.protect);

// ==============================================================================
// 1. STATIC ROUTES (MUST BE BEFORE /:id)
// ==============================================================================
router.get("/search", checkPermission(PERMISSIONS.PRODUCT.READ), productController.searchProducts);
router.post("/bulk-import", checkPermission(PERMISSIONS.PRODUCT.CREATE), productController.bulkImportProducts);
router.post('/bulk-update', checkPermission(PERMISSIONS.PRODUCT.UPDATE), productController.bulkUpdateProducts);

// 🟢 CRITICAL FIX: Moved this up so "reports" doesn't get treated as an :id
router.get('/reports/low-stock', checkPermission(PERMISSIONS.PRODUCT.READ), productController.getLowStockProducts);

// ==============================================================================
// 2. ROOT ROUTES
// ==============================================================================
router.route("/")
  .get(checkPermission(PERMISSIONS.PRODUCT.READ), productController.getAllProducts)
  .post(checkPermission(PERMISSIONS.PRODUCT.CREATE), productController.createProduct);

// ==============================================================================
// 3. ID-BASED ROUTES (Dynamic :id)
// ==============================================================================
router.post('/:id/stock-adjust', checkPermission(PERMISSIONS.PRODUCT.STOCK_ADJUST), productController.adjustStock);

// Fixed: Mapped to STOCK.MANAGE since PRODUCT.STOCK_TRANSFER doesn't exist in your config
router.post('/:id/stock-transfer', checkPermission(PERMISSIONS.STOCK.MANAGE), productController.transferStock);

router.patch('/:id/upload', checkPermission(PERMISSIONS.PRODUCT.UPDATE), upload.array('photos', 10), productController.uploadProductImage);
router.patch("/:id/restore", checkPermission(PERMISSIONS.PRODUCT.UPDATE), productController.restoreProduct);
router.get('/:id/history', checkPermission(PERMISSIONS.PRODUCT.READ), productController.getProductHistory);

// Standard CRUD
router.route("/:id")
  .get(checkPermission(PERMISSIONS.PRODUCT.READ), productController.getProduct)
  .patch(checkPermission(PERMISSIONS.PRODUCT.UPDATE), productController.updateProduct)
  .delete(checkPermission(PERMISSIONS.PRODUCT.DELETE), productController.deleteProduct);

module.exports = router;
