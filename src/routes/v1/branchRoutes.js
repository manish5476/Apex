const express = require('express');
const router = express.Router();
const branchController = require('../../modules/organization/core/branch.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get(
  '/my-branches',
  checkPermission(PERMISSIONS.BRANCH.READ),
  branchController.getMyBranches
);

router.route('/')
  .post(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.createBranch)
  .get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getAllBranches);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getBranch)
  .patch(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.updateBranch)
  .delete(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.deleteBranch);

module.exports = router;

// const express = require('express');
// const router = express.Router();
// const branchController = require('../../modules/organization/core/branch.controller');
// const authController = require('../../modules/auth/core/auth.controller');
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// router.get(
//   '/my-branches',
//   checkPermission(PERMISSIONS.BRANCH.READ),
//   branchController.getMyBranches
// );

// router.route('/')
//   .post(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.createBranch)
//   .get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getAllBranches);

// router.route('/:id')
//   .get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getBranch)
//   .patch(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.updateBranch)
//   .delete(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.deleteBranch);

// module.exports = router;
