const express = require('express');
const router = express.Router();
const branchController = require('../../controllers/branchController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
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
// const branchController = require('../../controllers/branchController');
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// router.route('/my-branches').get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getMyBranches);

// router.route('/')
//   .post(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.createBranch)
//   .get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getAllBranches);

// router.route('/:id')
//   .get(checkPermission(PERMISSIONS.BRANCH.READ), branchController.getBranch)
//   .patch(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.updateBranch)
//   .delete(checkPermission(PERMISSIONS.BRANCH.MANAGE), branchController.deleteBranch);

// module.exports = router;