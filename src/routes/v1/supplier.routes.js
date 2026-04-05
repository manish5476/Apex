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
/** GET /search @query { q } @payload none */
router.get('/search', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.searchSuppliers);

/** GET /list @payload none */
router.get('/list', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplierList);

/** POST /bulk-supplier @payload { suppliers* (array) } */
router.post('/bulk-supplier', checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createbulkSupplier);

// ── Root CRUD ────────────────────────────────────────────────────────────────
router.route('/')
  /** POST / @payload { name*, phone, email, gstNumber, address, creditLimit, etc } */
  .post(checkPermission(PERMISSIONS.SUPPLIER.CREATE), supplierController.createSupplier)
  /** GET / @query { page, limit, status, etc } @payload none */
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getAllSuppliers);

// ── KYC document routes ──────────────────────────────────────────────────────
// Note: route param is :docId (not :docIndex) — deletion is now _id-based, not index-based
/** POST /:id/kyc @params { id } @payload { file* } */
router.post('/:id/kyc',
  checkPermission(PERMISSIONS.SUPPLIER.UPDATE),
  upload.single('file'),
  supplierController.uploadKycDocument
);

/** DELETE /:id/kyc/:docId @params { id, docId } @payload none */
router.delete('/:id/kyc/:docId',
  checkPermission(PERMISSIONS.SUPPLIER.UPDATE),
  supplierController.deleteKycDocument
);

// ── Analytics & exports ──────────────────────────────────────────────────────
/** GET /:id/ledger-export @params { id } @payload none */
router.get('/:id/ledger-export', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.downloadSupplierLedger);

/** GET /:id/dashboard @params { id } @payload none */
router.get('/:id/dashboard', checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplierDashboard);

// ── Dynamic ID CRUD (always last) ───────────────────────────────────────────
router.route('/:id')
  /** GET /:id @params { id } @payload none */
  .get(checkPermission(PERMISSIONS.SUPPLIER.READ), supplierController.getSupplier)
  /** PATCH /:id @params { id } @payload { updates } */
  .patch(checkPermission(PERMISSIONS.SUPPLIER.UPDATE), supplierController.updateSupplier)
  /** DELETE /:id @params { id } @payload none */
  .delete(checkPermission(PERMISSIONS.SUPPLIER.DELETE), supplierController.deleteSupplier);

/** PATCH /:id/restore @params { id } @payload none */
router.patch('/:id/restore', checkPermission(PERMISSIONS.SUPPLIER.UPDATE), supplierController.restoreSupplier);

module.exports = router;