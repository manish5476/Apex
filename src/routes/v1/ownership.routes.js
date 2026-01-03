const express = require('express');
const router = express.Router();
const ownership = require('../../modules/_legacy/controllers/ownership.controller');
const authController = require('../../modules/auth/core/auth.controller'); // Your auth middleware
const { checkPermission, } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require('../../config/permissions');

// Protect all routes
router.use(authController.protect);
// Add permissions to ownership routes:
router.post(
  '/initiate',
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.initiateOwnershipTransfer
);

router.post(
  '/finalize',
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.finalizeOwnershipTransfer
);

router.post(
  '/ownership/cancel',
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.cancelOwnershipTransfer
);

router.post(
  '/ownership/force',
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.forceTransferOwnership
);

// // Step 1: Current Owner starts it
// // POST /api/v1/ownership/initiate
// router.post(
//   '/initiate',
//   authController.restrictTo('superadmin'),
//   ownership.initiateOwnershipTransfer
// );

// // Step 2: New Owner accepts it
// // POST /api/v1/ownership/finalize
// router.post(
//   '/finalize',
//   ownership.finalizeOwnershipTransfer
// );

// router.post(
//   '/ownership/cancel',
//   authController.restrictTo('superadmin'), // Only the current owner can cancel
//   ownership.cancelOwnershipTransfer
// );

// router.post(
//   '/ownership/force',
//   authController.restrictTo('superadmin'), // Strictly for current owner
//   ownership.forceTransferOwnership
// );

module.exports = router;
