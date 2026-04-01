


// =============================================================================
// routes/organizationExtras.routes.js
// =============================================================================
const express = require('express');
const router = express.Router();
const authController = require('../../modules/auth/core/auth.controller');
const orgExtrasController = require('../../modules/organization/core/organizationExtras.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

router.use(authController.protect);

// Note: transferOwnership has been removed from this file.
// All ownership operations are now in ownership.routes.js (with email confirmation flow).

router.post('/invite', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), orgExtrasController.inviteUser);
router.get('/activity-log', checkPermission(PERMISSIONS.ORG.MANAGE), orgExtrasController.getActivityLog);
router.delete('/members/:id', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), orgExtrasController.removeMember);

module.exports = router;
