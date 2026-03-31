


// =============================================================================
// routes/organizationExtras.routes.js
// =============================================================================
const express = require('express');
const router  = express.Router();
const authController = require('../../modules/auth/core/auth.controller');
const orgExtrasController = require('../../modules/organization/core/organizationExtras.controller');
const { checkPermission } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS }     = require('../../config/permissions');
 
router.use(authController.protect);
 
// Note: transferOwnership has been removed from this file.
// All ownership operations are now in ownership.routes.js (with email confirmation flow).
 
router.post('/invite',        checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), orgExtrasController.inviteUser);
router.get('/activity-log',   checkPermission(PERMISSIONS.ORG.MANAGE),         orgExtrasController.getActivityLog);
router.delete('/members/:id', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), orgExtrasController.removeMember);
 
module.exports = router;
 


// const express = require("express");
// const router = express.Router();
// const authController = require("../../modules/auth/core/auth.controller");
// const orgController = require("../../modules/organization/core/organizationExtras.controller");
// const { checkPermission, checkIsOwner } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// // Protect all routes globally
// router.use(authController.protect);

// // ==============================================================================
// // 1. HIGH SECURITY ACTIONS
// // ==============================================================================
// // 🟢 Fortified with checkIsOwner() so only the true owner can transfer the organization
// router.patch(
//   "/transfer-ownership", 
//   checkIsOwner(), 
//   checkPermission(PERMISSIONS.ORG.TRANSFER), 
//   orgController.transferOwnership
// );

// // ==============================================================================
// // 2. MEMBER MANAGEMENT & ACTIVITY
// // ==============================================================================
// router.post("/invite", checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), orgController.inviteUser);

// router.get("/activity-log", checkPermission(PERMISSIONS.ORG.MANAGE), orgController.getActivityLog);

// // Dynamic ID route goes last!
// router.delete("/members/:id", checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), orgController.removeMember);

// module.exports = router;
