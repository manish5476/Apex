const express = require("express");
const router = express.Router();
const productController = require("../../controllers/productController");
const authController = require("../../controllers/authController");
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
// // src/routes/productRoutes.js
// const express = require("express");
// const productController = require("../../controllers/productController");
// const authController = require("../../controllers/authController");
// const { upload } = require("../../middleware/uploadMiddleware");

// const router = express.Router();

// // -------------------------------------------------------
// // ALL ROUTES REQUIRE AUTH
// // -------------------------------------------------------
// router.use(authController.protect);

// // -------------------------------------------------------
// // 🔍 SEARCH (must be above /:id)
// // GET /products/search?q=term
// // -------------------------------------------------------
// router.get(
//   "/search",
//   authController.restrictTo("read_products", "superadmin"),
//   productController.searchProducts
// );

// // -------------------------------------------------------
// // 🧩 BULK IMPORT PRODUCTS
// // POST /products/bulk-import
// // -------------------------------------------------------
// router.post(
//   "/bulk-import",
//   authController.restrictTo("create_products", "superadmin"),
//   productController.bulkImportProducts
// );

// // -------------------------------------------------------
// // 🖼 PRODUCT IMAGE UPLOAD
// // PATCH /products/:id/upload
// // -------------------------------------------------------


// router.patch(
//   '/:id/upload',
//   authController.protect,
//   upload.array('photos', 10), // <--- CHANGE TO ARRAY, use key 'photos'
//   productController.uploadProductImage
// );
// // -------------------------------------------------------
// // CRUD ROUTES
// // -------------------------------------------------------
// router
//   .route("/")
//   .get(
//     authController.restrictTo("read_products", "superadmin"),
//     productController.getAllProducts
//   )
//   .post(
//     authController.restrictTo("create_products", "superadmin"),
//     productController.createProduct
//   );

// router
//   .route("/:id")
//   .get(
//     authController.restrictTo("read_products", "superadmin"),
//     productController.getProduct
//   )
//   .patch(
//     authController.restrictTo("update_products", "superadmin"),
//     productController.updateProduct
//   )
//   .delete(
//     authController.restrictTo("delete_products", "superadmin"),
//     productController.deleteProduct
//   );

// // -------------------------------------------------------
// // RESTORE ROUTE
// // -------------------------------------------------------
// router.patch(
//   "/:id/restore",
//   authController.restrictTo("update_products", "superadmin"),
//   productController.restoreProduct
// );

// router.post('/bulk-update',
//   authController.restrictTo('update_products','superadmin'),
//   productController.bulkUpdateProducts
// );

// router.post('/:id/stock-adjust',
//   authController.restrictTo('update_products','superadmin'),
//   productController.adjustStock
// );


// module.exports = router;

