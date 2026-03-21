const express = require('express');
const router = express.Router();
const branchController = require('../../modules/organization/core/branch.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. USER-SPECIFIC BRANCHES (Static Prefix)
// ======================================================

/**
 * Retrieves branches specific to the logged-in user.
 * Useful for dropdowns and limited-scope views.
 */
router.get(
  '/my-branches',
  checkPermission(PERMISSIONS.BRANCH.READ),
  branchController.getMyBranches
);

// ======================================================
// 2. ORGANIZATION COLLECTION
// ======================================================

router.route('/')
  // Create a new branch (Admin)
  .post(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.createBranch)
  // View all branches in the organization (Admin/HQ View)
  .get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getAllBranches);

// ======================================================
// 3. SPECIFIC BRANCH ACTIONS (:id)
// ======================================================

router.route('/:id')
  .get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getBranch)
  .patch(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.updateBranch)
  .delete(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.deleteBranch);

module.exports = router;