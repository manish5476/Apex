const express = require('express');
const router = express.Router();
const accountController = require('../../modules/accounting/core/account.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. HIERARCHY & STRUCTURE (Specialized Actions)
// ======================================================

// View the tree structure of the Chart of Accounts
router.get(
  '/hierarchy',
  checkPermission(PERMISSIONS.ACCOUNT.READ), // Changed to READ for visibility
  accountController.getHierarchy
);

// Move an account under a different parent (High-risk action)
router.put(
  '/:id/reparent',
  checkPermission(PERMISSIONS.ACCOUNT.MANAGE),
  accountController.reparentAccount
);

// ======================================================
// 2. CORE CRUD OPERATIONS
// ======================================================

router.route('/')
  .get(checkPermission(PERMISSIONS.ACCOUNT.READ), accountController.getAccounts) // READ for dropdowns/lists
  .post(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.createAccount);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.ACCOUNT.READ), accountController.getAccount)
  .put(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.updateAccount)
  .delete(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.deleteAccount);

module.exports = router;