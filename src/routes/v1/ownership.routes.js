
// =============================================================================
// routes/ownership.routes.js
// =============================================================================
const express = require('express');
const router = express.Router();
const ownership = require('../../modules/organization/core/ownership.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission, checkIsOwner } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

router.use(authController.protect);

// Initiate: owner-only — starts the email confirmation flow
router.post('/initiate',
  checkIsOwner(),
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.initiateOwnershipTransfer
);

// Finalize: called by the *receiver* after clicking the email link — no checkIsOwner
router.post('/finalize',
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.finalizeOwnershipTransfer
);

// Cancel: only the current owner (initiator) can cancel
router.post('/cancel',
  checkIsOwner(),
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.cancelOwnershipTransfer
);

// Force: instant swap, no email — owner-only, high-security action
router.post('/force',
  checkIsOwner(),
  checkPermission(PERMISSIONS.OWNERSHIP.TRANSFER),
  ownership.forceTransferOwnership
);

module.exports = router;
