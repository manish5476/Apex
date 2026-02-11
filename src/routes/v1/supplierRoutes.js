const express = require('express');
const router = express.Router();
const multer = require('multer'); // 🟢 Added for file uploads
const supplierController = require('../../modules/organization/core/supplier.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Set up multer to store files in memory temporarily before Cloudinary upload
const upload = multer({ storage: multer.memoryStorage() });

router.use(authController.protect);

router.get('/search', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.searchSuppliers);
router.get('/list', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplierList);

router.route('/bulk-supplier')
  .post(checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createbulkSupplier);

router.route('/')
  .post(checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createSupplier)
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getAllSuppliers);

// ==========================================
// 🟢 NEW KYC ROUTES (Must be placed BEFORE /:id)
// ==========================================
router.post('/:id/kyc', 
  checkPermission(PERMISSIONS.SUPPLIER.UPDATE), 
  upload.single('file'), // Multer middleware captures the 'file' field
  supplierController.uploadKycDocument
);

router.delete('/:id/kyc/:docIndex', 
  checkPermission(PERMISSIONS.SUPPLIER.UPDATE), 
  supplierController.deleteKycDocument
);

// ==========================================

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