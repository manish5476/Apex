const express = require('express');
const router = express.Router();
const organizationController = require('../../controllers/organizationController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

// Public
router.post('/create', organizationController.createOrganization);

router.use(authController.protect);

router.get('/pending-members', organizationController.getPendingMembers);// checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS)
router.post('/approve-member', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.approveMember);
// Members & Approval
// router.get('/pending-members', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.getPendingMembers);
// router.post('/approve-member', checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), organizationController.approveMember);

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




// const express = require('express');
// const organizationController = require('../../controllers/organizationController');
// const authController = require('../../controllers/authController');

// const router = express.Router();

// /* ==========================================================
//  *  PUBLIC
//  * ========================================================== */
// router.post('/create', organizationController.createOrganization);

// /* ==========================================================
//  *  PROTECTED ROUTES
//  * ========================================================== */
// router.use(authController.protect);

// router.get(
//   '/pending-members',
//   authController.protect,
//   // authController.restrictTo('superadmin', 'admin'),
//   organizationController.getPendingMembers
// );


// // Owner/admin manage own organization
// router
//   .route('/my-organization').get(organizationController.getMyOrganization).patch(
//     // authController.restrictTo('superadmin', 'admin'),
//     organizationController.updateMyOrganization
//   )
//   .delete(
//     authController.restrictTo('superadmin'),
//     organizationController.deleteMyOrganization
//   );

// // Approve member
// router.post(
//   '/approve-member',
//   // authController.restrictTo('superadmin', 'admin'),
//   organizationController.approveMember
// );


// /* ==========================================================
//  *  PLATFORM ADMIN ROUTES
//  * ========================================================== */
// router
//   .route('/')
//   .get(
//     // authController.restrictTo('platform-admin'),
//     organizationController.getAllOrganizations
//   );

// router
//   .route('/:id')
//   .get(
//     // authController.restrictTo('platform-admin'),
//     organizationController.getOrganization
//   )
//   .patch(
//     // authController.restrictTo('platform-admin'),
//     organizationController.updateOrganization
//   )
//   .delete(
//     // authController.restrictTo('platform-admin'),
//     organizationController.deleteOrganization
//   );

// module.exports = router;

