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
  authController.restrictTo('superadmin', 'admin'),
  organizationController.getPendingMembers
);


// Owner/admin manage own organization
router
  .route('/my-organization').get(organizationController.getMyOrganization).patch(
    authController.restrictTo('superadmin', 'admin'),
    organizationController.updateMyOrganization
  )
  .delete(
    authController.restrictTo('superadmin'),
    organizationController.deleteMyOrganization
  );

// Approve member
router.post(
  '/approve-member',
  authController.restrictTo('superadmin', 'admin'),
  organizationController.approveMember
);

/* ==========================================================
 *  PLATFORM ADMIN ROUTES
 * ========================================================== */
router
  .route('/')
  .get(
    authController.restrictTo('platform-admin'),
    organizationController.getAllOrganizations
  );

router
  .route('/:id')
  .get(
    authController.restrictTo('platform-admin'),
    organizationController.getOrganization
  )
  .patch(
    authController.restrictTo('platform-admin'),
    organizationController.updateOrganization
  )
  .delete(
    authController.restrictTo('platform-admin'),
    organizationController.deleteOrganization
  );

module.exports = router;


// const express = require('express');
// const organizationController = require('../../controllers/organizationController');
// const authController = require('../../controllers/authController'); // We will create this next

// const router = express.Router();

// // ==========================================================
// //  PUBLIC ROUTE
// // ==========================================================
// // This is the main "Sign Up" for a new company. It MUST be public.
// router.post('/create', organizationController.createOrganization);

// // ==========================================================
// //  PROTECTED ROUTES (User must be logged in)
// // ==========================================================
// // All routes below this line will be protected by our auth middleware
// router.use(authController.protect);

// // Routes for an admin/owner to manage their *OWN* organization
// router
//   .route('/my-organization')
//   .get(organizationController.getMyOrganization)
//   .patch(
//     authController.restrictTo('superadmin', 'admin'), // Only admins
//     organizationController.updateMyOrganization
//   )
//   .delete(
//     authController.restrictTo('superadmin'), // Only the owner
//     organizationController.deleteMyOrganization
//   );

// // Route for an admin/owner to approve a new employee
// router.post(
//   '/approve-member',
//   authController.restrictTo('superadmin', 'admin'),
//   organizationController.approveMember
// );

// // ==========================================================
// //  PLATFORM-ADMIN ONLY ROUTES (For you)
// // ==========================================================
// // These routes are for YOU (the platform owner) to manage all orgs.
// // We protect them with a special 'platform-admin' role.
// router
//   .route('/')
//   .get(
//     authController.restrictTo('platform-admin'), // You need to define this role
//     organizationController.getAllOrganizations
//   );

// router
//   .route('/:id')
//   .get(
//     authController.restrictTo('platform-admin'),
//     organizationController.getOrganization
//   )
//   .patch(
//     authController.restrictTo('platform-admin'),
//     organizationController.updateOrganization
//   )
//   .delete(
//     authController.restrictTo('platform-admin'),
//     organizationController.deleteOrganization
//   );

// module.exports = router;

// // const express = require('express');
// // const organizationController = require('../../controllers/organizationController');
// // const authController = require('../../controllers/authController'); // We will create this next

// // const router = express.Router();

// // // ==========================================================
// // //  PUBLIC ROUTE
// // // ==========================================================
// // // This is the main "Sign Up" for a new company. It MUST be public.
// // router.post('/create', organizationController.createOrganization);

// // // ==========================================================
// // //  PROTECTED ROUTES (User must be logged in)
// // // ==========================================================
// // // All routes below this line will be protected by our auth middleware
// // router.use(authController.protect);

// // // Routes for an admin/owner to manage their *OWN* organization
// // router
// //   .route('/my-organization')
// //   .get(organizationController.getMyOrganization)
// //   .patch(
// //     authController.restrictTo('superadmin', 'admin'), // Only admins
// //     organizationController.updateMyOrganization
// //   )
// //   .delete(
// //     authController.restrictTo('superadmin'), // Only the owner
// //     organizationController.deleteMyOrganization
// //   );

// // // Route for an admin/owner to approve a new employee
// // router.post(
// //   '/approve-member',
// //   authController.restrictTo('superadmin', 'admin'),
// //   organizationController.approveMember
// // );

// // // ==========================================================
// // //  SUPER-ADMIN ONLY ROUTES (Platform Owner)
// // // ==========================================================
// // // These routes are for YOU (the platform owner) to manage all orgs.
// // // We protect them with a special 'platform-admin' role.
// // router
// //   .route('/')
// //   .get(
// //     authController.restrictTo('platform-admin'),
// //     organizationController.getAllOrganizations
// //   );

// // router
// //   .route('/:id')
// //   .get(
// //     authController.restrictTo('platform-admin'),
// //     organizationController.getOrganization
// //   )
// //   .patch(
// //     authController.restrictTo('platform-admin'),
// //     organizationController.updateOrganization
// //   )
// //   .delete(
// //     authController.restrictTo('platform-admin'),
// //     organizationController.deleteOrganization
// //   );

// // module.exports = router;

// // // const express = require('express');
// // // const organizationController = require('../controllers/organizationController');
// // // const authController = require('../controllers/authController');

// // // const router = express.Router();

// // // // Protect all routes
// // // router.use(authController.protect);

// // // // Superadmin only: create and list organizations
// // // router
// // //   .route('/')
// // //   .post(authController.restrictTo('superadmin'), organizationController.createOrganization)
// // //   .get(authController.restrictTo('superadmin'), organizationController.getAllOrganizations);

// // // // Individual org routes
// // // router
// // //   .route('/:id')
// // //   .get(organizationController.getOrganization)
// // //   .patch(authController.restrictTo('superadmin', 'admin'), organizationController.updateOrganization)
// // //   .delete(authController.restrictTo('superadmin'), organizationController.deleteOrganization);

// // // // Approve employees
// // // router
// // //   .route('/:id/approve-member')
// // //   .post(authController.restrictTo('superadmin', 'admin'), organizationController.approveMember);

// // // module.exports = router;
