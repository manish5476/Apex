const express = require("express");
const router = express.Router();
const productController = require("../../controllers/productController");
const authController = require("@modules/auth/core/auth.controller");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");
const { upload } = require("../../middleware/uploadMiddleware");

router.use(authController.protect);

router.get("/search", checkPermission(PERMISSIONS.PRODUCT.READ), productController.searchProducts);
router.post("/bulk-import", checkPermission(PERMISSIONS.PRODUCT.CREATE), productController.bulkImportProducts);
router.post('/bulk-update', checkPermission(PERMISSIONS.PRODUCT.UPDATE), productController.bulkUpdateProducts);
router.post('/:id/stock-adjust', checkPermission(PERMISSIONS.PRODUCT.STOCK_ADJUST), productController.adjustStock);

router.patch('/:id/upload', checkPermission(PERMISSIONS.PRODUCT.UPDATE), upload.array('photos', 10), productController.uploadProductImage);
router.patch("/:id/restore", checkPermission(PERMISSIONS.PRODUCT.UPDATE), productController.restoreProduct);

router.route("/")
  .get(checkPermission(PERMISSIONS.PRODUCT.READ), productController.getAllProducts)
  .post(checkPermission(PERMISSIONS.PRODUCT.CREATE), productController.createProduct);

router.route("/:id")
  .get(checkPermission(PERMISSIONS.PRODUCT.READ), productController.getProduct)
  .patch(checkPermission(PERMISSIONS.PRODUCT.UPDATE), productController.updateProduct)
  .delete(checkPermission(PERMISSIONS.PRODUCT.DELETE), productController.deleteProduct);

module.exports = router;