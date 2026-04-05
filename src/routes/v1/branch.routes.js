

const express = require('express');
const router = express.Router();
const branchController = require('../../modules/organization/core/branch.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

// All branch routes require authentication
router.use(authController.protect);

/**
 * GET /my-branches
 * @payload none
 */
router.get('/my-branches', checkPermission(PERMISSIONS.BRANCH.READ), branchController.getMyBranches);

router.route('/')
  /**
   * POST /
   * @payload { name*, branchCode, address, isMainBranch, etc. }
   */
  .post(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.createBranch)
  /**
   * GET /
   * @payload none
   */
  .get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getAllBranches);

router.route('/:id')
  /**
   * GET /:id
   * @params { id }
   * @payload none
   */
  .get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getBranch)
  /**
   * PATCH /:id
   * @params { id }
   * @payload { name, branchCode, address, ... }
   */
  .patch(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.updateBranch)
  /**
   * DELETE /:id
   * @params { id }
   * @payload none
   */
  .delete(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.deleteBranch);

module.exports = router;
