const express = require('express');
const router = express.Router();
const supplierController = require('../../controllers/supplierController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get('/search', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.searchSuppliers);
router.get('/list', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplierList);

router.route('/bulk-supplier')
  .post(checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createbulkSupplier)
router.route('/')
  .post(checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createSupplier)
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getAllSuppliers);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplier)
  .patch(checkPermission(PERMISSIONS.SUPPLIER.UPDATE), supplierController.updateSupplier)
  .delete(checkPermission(PERMISSIONS.SUPPLIER.DELETE), supplierController.deleteSupplier);

module.exports = router;