const express = require('express');
const router = express.Router();
const ownership = require('../../modules/organization/core/ownership.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission, checkIsOwner } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require('../../config/permissions');

// Protect all routes globally
router.use(authController.protect);

// ==============================================================================
// OWNERSHIP TRANSFER ROUTES
// ==============================================================================

// Initiate a transfer (Requires explicit Owner status AND the permission tag)
router.post(
  '/initiate',
  checkIsOwner(),
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.initiateOwnershipTransfer
);

// Finalize a transfer (Often done by the receiver, so just the permission/auth might be enough here depending on your logic)
router.post(
  '/finalize',
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.finalizeOwnershipTransfer
);

// Cancel a pending transfer (Fixed routing path)
router.post(
  '/cancel',
  checkIsOwner(),
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.cancelOwnershipTransfer
);

// Force a transfer (Usually reserved for Super Admins or strict Owners)
router.post(
  '/force',
  checkIsOwner(),
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.forceTransferOwnership
);

module.exports = router;
