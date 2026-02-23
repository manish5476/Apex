const express = require('express');
const router = express.Router();
const organizationController = require('../../modules/organization/core/organization.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission, checkIsOwner } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// ==============================================================================
// 1. PUBLIC ROUTES
// ==============================================================================
router.post('/create', organizationController.createOrganization);

// Protect all subsequent routes
router.use(authController.protect);

// ==============================================================================
// 2. MEMBER MANAGEMENT
// ==============================================================================
// 🟢 Applied the permission you had commented out!
router.get('/pending-members', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.getPendingMembers);
router.post('/approve-member', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.approveMember);
router.post('/reject-member', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.rejectMember);

// ==============================================================================
// 3. MANAGE OWN ORGANIZATION
// ==============================================================================
router.route('/my-organization')
  .get(organizationController.getMyOrganization) // Open to all logged-in users
  .patch(checkPermission(PERMISSIONS.ORG.MANAGE), organizationController.updateMyOrganization)
  // 🟢 Added checkIsOwner() for maximum security on deletion
  .delete(checkIsOwner(), checkPermission(PERMISSIONS.ORG.MANAGE), organizationController.deleteMyOrganization);

// ==============================================================================
// 4. PLATFORM ADMIN (SuperAdmin Actions)
// ==============================================================================
router.route('/')
  .get(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.getAllOrganizations);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.getOrganization)
  .patch(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.updateOrganization)
  .delete(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.deleteOrganization);

module.exports = router;
