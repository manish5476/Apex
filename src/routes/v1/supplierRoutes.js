const express = require('express');
const router = express.Router();
const supplierController = require('../../controllers/supplierController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get('/search', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.searchSuppliers);
router.get('/list', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplierList);

router.route('/')
  .post(checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createSupplier)
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getAllSuppliers);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplier)
  .patch(checkPermission(PERMISSIONS.SUPPLIER.UPDATE), supplierController.updateSupplier)
  .delete(checkPermission(PERMISSIONS.SUPPLIER.DELETE), supplierController.deleteSupplier);

module.exports = router;
// const express = require('express');
// const supplierController = require('../../controllers/supplierController');
// const authController = require('../../controllers/authController');

// const router = express.Router();

// /* ==========================================================
//  *  PROTECTED ROUTES
//  * ========================================================== */
// router.use(authController.protect);

// // Only organization admins/superadmins can create/update/delete suppliers
// router
//   .route('/')
//   .post(
//     authController.restrictTo('superadmin', 'admin'),
//     supplierController.createSupplier
//   )
//   .get(supplierController.getAllSuppliers);

// router
//   .route('/list')
//   .get(supplierController.getSupplierList);

// router
//   .route('/:id')
//   .get(supplierController.getSupplier)
//   .patch(
//     authController.restrictTo('superadmin', 'admin'),
//     supplierController.updateSupplier
//   )
//   .delete(
//     authController.restrictTo('superadmin'),
//     supplierController.deleteSupplier
//   );

//   router.get('/search',
//   authController.restrictTo('read_suppliers','superadmin'),
//   supplierController.searchSuppliers
// );

// // if not present, upload endpoint
// // router.patch('/:id/upload',
// //   upload.single('photo'),
// //   supplierController.uploadSupplierPhoto
// // );


// module.exports = router;
