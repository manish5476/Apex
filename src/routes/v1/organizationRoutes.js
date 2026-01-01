const express = require('express');
const router = express.Router();
const organizationController = require('../../controllers/organizationController');
const authController = require('@modules/auth/core/auth.controller');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

// Public
router.post('/create', organizationController.createOrganization);

router.use(authController.protect);

router.get('/pending-members', organizationController.getPendingMembers);// checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS)
router.post('/approve-member', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.approveMember);
router.post('/reject-member', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.rejectMember);

// Manage OWN Organization
router.route('/my-organization')
  .get(organizationController.getMyOrganization) // Usually open to logged in users to see their own org
  .patch(checkPermission(PERMISSIONS.ORG.MANAGE), organizationController.updateMyOrganization)
  .delete(checkPermission(PERMISSIONS.ORG.MANAGE), organizationController.deleteMyOrganization);

// PLATFORM Admin (SuperAdmin actions)
router.route('/')
  .get(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.getAllOrganizations);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.getOrganization)
  .patch(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.updateOrganization)
  .delete(checkPermission(PERMISSIONS.ORG.MANAGE_PLATFORM), organizationController.deleteOrganization);

module.exports = router;
