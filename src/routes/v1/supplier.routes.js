const express = require('express');
const router = express.Router();

const supplierController = require('../../modules/organization/core/supplier.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');
const { upload } = require('../../core/middleware/upload.middleware'); // central middleware — no duplicate multer config

// Protect all routes
router.use(authController.protect);

// ── Static routes (MUST be before /:id) ─────────────────────────────────────
router.get('/search', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.searchSuppliers);
router.get('/list', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplierList);
router.post('/bulk-supplier', checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createbulkSupplier);

// ── Root CRUD ────────────────────────────────────────────────────────────────
router.route('/')
  .post(checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createSupplier)
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getAllSuppliers);

// ── KYC document routes ──────────────────────────────────────────────────────
// Note: route param is :docId (not :docIndex) — deletion is now _id-based, not index-based
router.post('/:id/kyc',
  checkPermission(PERMISSIONS.SUPPLIER.UPDATE),
  upload.single('file'),
  supplierController.uploadKycDocument
);
router.delete('/:id/kyc/:docId',
  checkPermission(PERMISSIONS.SUPPLIER.UPDATE),
  supplierController.deleteKycDocument
);

// ── Analytics & exports ──────────────────────────────────────────────────────
router.get('/:id/ledger-export', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.downloadSupplierLedger);
router.get('/:id/dashboard', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplierDashboard);

// ── Dynamic ID CRUD (always last) ───────────────────────────────────────────
router.route('/:id')
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplier)
  .patch(checkPermission(PERMISSIONS.SUPPLIER.UPDATE), supplierController.updateSupplier)
  .delete(checkPermission(PERMISSIONS.SUPPLIER.DELETE), supplierController.deleteSupplier);

router.patch('/:id/restore', checkPermission(PERMISSIONS.SUPPLIER.UPDATE), supplierController.restoreSupplier);

module.exports = router;