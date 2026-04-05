// =============================================================================
// routes/customer.routes.js
// =============================================================================
const express = require('express');
const router = express.Router();
const customerController = require('../../modules/organization/core/customer.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');
const { upload } = require('../../core/middleware/upload.middleware');
router.use(authController.protect);

// ── Static & bulk routes (MUST be before /:id) ──────────────────────────────
/**
 * GET /search
 * @query { q (or search) }
 * @payload none
 */
router.get('/search', checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.searchCustomers);

/**
 * GET /check-duplicate
 * @query { phone, email, gstNumber }
 * @payload none
 */
router.get('/check-duplicate', checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.checkDuplicate);

/**
 * POST /bulk-update
 * @payload { customers (array), updates }
 */
router.post('/bulk-update', checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.bulkUpdateCustomers);

/**
 * POST /bulk-customer
 * @payload { customers (array) }
 */
router.post('/bulk-customer', checkPermission(PERMISSIONS.CUSTOMER.CREATE), customerController.createBulkCustomer);

// ── Specialized ID actions ───────────────────────────────────────────────────
/**
 * PATCH /:id/upload
 * @params { id }
 * @payload { avatar (file) }
 */
router.patch('/:id/upload', checkPermission(PERMISSIONS.CUSTOMER.UPDATE), upload.single('avatar'), customerController.uploadCustomerPhoto);

/**
 * PATCH /:id/restore
 * @params { id }
 * @payload none
 */
router.patch('/:id/restore', checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.restoreCustomer);

/**
 * PATCH /:id/credit-limit
 * @params { id }
 * @payload { creditLimit }
 */
router.patch('/:id/credit-limit', checkPermission(PERMISSIONS.CUSTOMER.CREDIT_LIMIT), customerController.updateCreditLimit);

// ── Core CRUD ────────────────────────────────────────────────────────────────
router.route('/')
  /**
   * GET /
   * @query { page, limit, sort, search, etc }
   * @payload none
   */
  .get(checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.getAllCustomers)
  /**
   * POST /
   * @payload { partyName*, phone*, email, address, etc }
   */
  .post(checkPermission(PERMISSIONS.CUSTOMER.CREATE), customerController.createCustomer);

router.route('/:id')
  /**
   * GET /:id
   * @params { id }
   * @payload none
   */
  .get(checkPermission(PERMISSIONS.CUSTOMER.READ), customerController.getCustomer)
  /**
   * PATCH /:id
   * @params { id }
   * @payload { partyName, phone, email, status, etc }
   */
  .patch(checkPermission(PERMISSIONS.CUSTOMER.UPDATE), customerController.updateCustomer)
  /**
   * DELETE /:id
   * @params { id }
   * @payload none
   */
  .delete(checkPermission(PERMISSIONS.CUSTOMER.DELETE), customerController.deleteCustomer);

module.exports = router;