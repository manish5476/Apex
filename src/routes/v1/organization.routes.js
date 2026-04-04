
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
/**
 * POST /create
 * @payload {
 *   organizationName* (required), ownerName* (required), ownerEmail* (required), ownerPassword* (required),
 *   uniqueShopId, primaryEmail, primaryPhone, gstNumber, mainBranchName, mainBranchAddress
 * }
 */
router.post('/create', organizationController.createOrganization);

/**
 * POST /lookup
 * @payload { email* (required) }
 */
router.post('/lookup', organizationController.lookupOrganizations);

/**
 * GET /shop/:uniqueShopId
 * @params { uniqueShopId }
 */
router.get('/shop/:uniqueShopId', organizationController.getOrganizationByShopId);

router.use(authController.protect);

// ── Member management ────────────────────────────────────────────────────────
router.get('/pending-members', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.getPendingMembers);

/**
 * POST /approve-member
 * @payload { userId* (required), roleId* (required), branchId* (required) }
 */
router.post('/approve-member', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.approveMember);

/**
 * POST /reject-member
 * @payload { userId* (required) }
 */
router.post('/reject-member', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.rejectMember);

// ── Self-service ─────────────────────────────────────────────────────────────
/**
 * PATCH /my-organization
 * @payload {
 *   name, primaryEmail, primaryPhone, secondaryEmail, secondaryPhone, gstNumber, uniqueShopId, logo,
 *   address: { street, city, state, zipCode, country },
 *   settings: { currency, timezone, financialYearStart }
 * }
 */
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
