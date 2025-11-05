const express = require('express');
const supplierController = require('../../controllers/supplierController');
const authController = require('../../controllers/authController');

const router = express.Router();

/* ==========================================================
 *  PROTECTED ROUTES
 * ========================================================== */
router.use(authController.protect);

// Only organization admins/superadmins can create/update/delete suppliers
router
  .route('/')
  .post(
    authController.restrictTo('superadmin', 'admin'),
    supplierController.createSupplier
  )
  .get(supplierController.getAllSuppliers);

router
  .route('/list')
  .get(supplierController.getSupplierList);

router
  .route('/:id')
  .get(supplierController.getSupplier)
  .patch(
    authController.restrictTo('superadmin', 'admin'),
    supplierController.updateSupplier
  )
  .delete(
    authController.restrictTo('superadmin'),
    supplierController.deleteSupplier
  );

module.exports = router;
