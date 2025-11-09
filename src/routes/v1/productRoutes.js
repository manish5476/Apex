const express = require('express');
const productController = require('../../controllers/productController');
const authController = require('../../controllers/authController');

const router = express.Router();

// All routes in this file are protected
router.use(authController.protect);

router
  .route('/')
  .get(
    authController.restrictTo('read_products', 'superadmin'),
    productController.getAllProducts
  )
  .post(
    authController.restrictTo('create_products', 'superadmin'),
    productController.createProduct
  );

router
  .route('/:id')
  .get(
    authController.restrictTo('read_products', 'superadmin'),
    productController.getProduct
  )
  .patch(
    authController.restrictTo('update_products', 'superadmin'),
    productController.updateProduct
  )
  .delete(
    authController.restrictTo('delete_products', 'superadmin'),
    productController.deleteProduct
  );

router
  .route('/:id/restore')
  .patch(
    authController.restrictTo('update_products', 'superadmin'),
    productController.restoreProduct
  );

  // uploadProductImages

module.exports = router;