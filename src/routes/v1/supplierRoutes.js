const express = require('express');
const router = express.Router();
const supplierController = require('../../modules/organization/core/supplier.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get('/search', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.searchSuppliers);
router.get('/list', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplierList);

router.route('/bulk-supplier')
  .post(checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createbulkSupplier);

router.route('/')
  .post(checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createSupplier)
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getAllSuppliers);
// Add this BEFORE the generic /:id route

router.get('/:id/ledger-export',
  checkPermission(PERMISSIONS.SUPPLIER.READ),
  supplierController.downloadSupplierLedger
);
router.get('/:id/dashboard', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplierDashboard);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplier)
  .patch(checkPermission(PERMISSIONS.SUPPLIER.UPDATE), supplierController.updateSupplier)
  .delete(checkPermission(PERMISSIONS.SUPPLIER.DELETE), supplierController.deleteSupplier);

module.exports = router;
