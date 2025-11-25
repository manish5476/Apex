const express = require('express');
const organizationController = require('../../controllers/organizationController');
const authController = require('../../controllers/authController');

const router = express.Router();

/* ==========================================================
 *  PUBLIC
 * ========================================================== */
router.post('/create', organizationController.createOrganization);

/* ==========================================================
 *  PROTECTED ROUTES
 * ========================================================== */
router.use(authController.protect);

router.get(
  '/pending-members',
  authController.protect,
  // authController.restrictTo('superadmin', 'admin'),
  organizationController.getPendingMembers
);


// Owner/admin manage own organization
router
  .route('/my-organization').get(organizationController.getMyOrganization).patch(
    // authController.restrictTo('superadmin', 'admin'),
    organizationController.updateMyOrganization
  )
  .delete(
    authController.restrictTo('superadmin'),
    organizationController.deleteMyOrganization
  );

// Approve member
router.post(
  '/approve-member',
  // authController.restrictTo('superadmin', 'admin'),
  organizationController.approveMember
);


/* ==========================================================
 *  PLATFORM ADMIN ROUTES
 * ========================================================== */
router
  .route('/')
  .get(
    // authController.restrictTo('platform-admin'),
    organizationController.getAllOrganizations
  );

router
  .route('/:id')
  .get(
    // authController.restrictTo('platform-admin'),
    organizationController.getOrganization
  )
  .patch(
    // authController.restrictTo('platform-admin'),
    organizationController.updateOrganization
  )
  .delete(
    // authController.restrictTo('platform-admin'),
    organizationController.deleteOrganization
  );

module.exports = router;

