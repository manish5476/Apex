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
/** GET /search @query { q } @payload none */
router.get("/search", checkPermission(PERMISSIONS.PRODUCT.READ), productController.searchProducts);

/** POST /bulk-import @payload { products* (array) } */
router.post("/bulk-import", checkPermission(PERMISSIONS.PRODUCT.CREATE), productController.bulkImportProducts);

/** POST /bulk-update @payload { products* (array) } */
router.post('/bulk-update', checkPermission(PERMISSIONS.PRODUCT.UPDATE), productController.bulkUpdateProducts);

/** GET /reports/low-stock @payload none */
router.get('/reports/low-stock', checkPermission(PERMISSIONS.PRODUCT.READ), productController.getLowStockProducts);

// ==============================================================================
// 2. ROOT ROUTES
// ==============================================================================

router.route("/")
  /** GET / @query { page, limit, category, brand, etc } @payload none */
  .get(checkPermission(PERMISSIONS.PRODUCT.READ), productController.getAllProducts)
  /** POST / @payload { name*, sku*, categoryId*, subCategoryId, brandId, unitId, price, taxes, etc } */
  .post(checkPermission(PERMISSIONS.PRODUCT.CREATE), productController.createProduct);

// ==============================================================================
// 3. ID-BASED ROUTES (Dynamic :id)
// ==============================================================================
/** POST /scan @payload { barcode* } */
router.post('/scan', checkPermission(PERMISSIONS.PRODUCT.STOCK_ADJUST), productController.scanProduct);

/** POST /:id/stock-adjust @params { id } @payload { quantity*, reason } */
router.post('/:id/stock-adjust', checkPermission(PERMISSIONS.PRODUCT.STOCK_ADJUST), productController.adjustStock);

/** POST /:id/stock-transfer @params { id } @payload { toBranchId*, quantity* } */
router.post('/:id/stock-transfer', checkPermission(PERMISSIONS.STOCK.MANAGE), productController.transferStock);

/** PATCH /:id/upload @params { id } @payload { photos (files) } */
router.patch('/:id/upload', checkPermission(PERMISSIONS.PRODUCT.UPDATE), upload.array('photos', 10), productController.uploadProductImage);

/** PATCH /:id/restore @params { id } @payload none */
router.patch("/:id/restore", checkPermission(PERMISSIONS.PRODUCT.UPDATE), productController.restoreProduct);

/** GET /:id/history @params { id } @payload none */
router.get('/:id/history', checkPermission(PERMISSIONS.PRODUCT.READ), productController.getProductHistory);

router.route("/:id")
  /** GET /:id @params { id } @payload none */
  .get(checkPermission(PERMISSIONS.PRODUCT.READ), productController.getProduct)
  /** PATCH /:id @params { id } @payload { updates } */
  .patch(checkPermission(PERMISSIONS.PRODUCT.UPDATE), productController.updateProduct)
  /** DELETE /:id @params { id } @payload none */
  .delete(checkPermission(PERMISSIONS.PRODUCT.DELETE), productController.deleteProduct);

module.exports = router;
