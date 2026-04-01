
// =============================================================================
// routes/organization.routes.js
// =============================================================================
const express = require('express');
const router = express.Router();
const organizationController = require('../../modules/organization/core/organization.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission, checkIsOwner } = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

// ── Public ───────────────────────────────────────────────────────────────────
router.post('/create', organizationController.createOrganization);
router.post('/lookup', organizationController.lookupOrganizations);
router.get('/shop/:uniqueShopId', organizationController.getOrganizationByShopId);

router.use(authController.protect);

// ── Member management ────────────────────────────────────────────────────────
router.get('/pending-members', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.getPendingMembers);
router.post('/approve-member', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.approveMember);
router.post('/reject-member', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.rejectMember);

// ── Self-service ─────────────────────────────────────────────────────────────
router.route('/my-organization')
  .get(organizationController.getMyOrganization)
  .patch(checkPermission(PERMISSIONS.ORG.MANAGE), organizationController.updateMyOrganization)
  .delete(checkIsOwner(), checkPermission(PERMISSIONS.ORG.MANAGE), organizationController.deleteMyOrganization);

// ── Platform admin ───────────────────────────────────────────────────────────
router.route('/')
  .get(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.getAllOrganizations);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.getOrganization)
  .patch(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.updateOrganization)
  .delete(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.deleteOrganization);

module.exports = router;
