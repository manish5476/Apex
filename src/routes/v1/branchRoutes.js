const express = require('express');
const branchController = require('../../controllers/branchController');
const authController = require('../../controllers/authController');

const router = express.Router();

/* ==========================================================
 *  PROTECTED ROUTES
 * ========================================================== */
router.use(authController.protect);

// --- For organization admins & superadmins only ---
router
  .route('/')
  .post(
    authController.restrictTo('superadmin', 'admin'),
    branchController.createBranch
  )
  .get(branchController.getAllBranches);

router
  .route('/my-branches')
  .get(branchController.getMyBranches);

router
  .route('/:id')
  .get(branchController.getBranch)
  .patch(
    authController.restrictTo('superadmin', 'admin'),
    branchController.updateBranch
  )
  .delete(
    authController.restrictTo('superadmin'),
    branchController.deleteBranch
  );

module.exports = router;



// const express = require('express');
// const branchController = require('../../controllers/branchController');
// const authController = require('../../controllers/authController');

// const router = express.Router();

// // All routes in this file are protected
// router.use(authController.protect);

// router
//   .route('/')
//   .get(branchController.getAllBranches)
//   .post(
//     authController.restrictTo('create_branches', 'superadmin'),
//     branchController.createBranch
//   );

// router
//   .route('/:id')
//   .get(branchController.getBranch)
//   .patch(
//     authController.restrictTo('update_branches', 'superadmin'),
//     branchController.updateBranch
//   )
//   .delete(
//     authController.restrictTo('delete_branches', 'superadmin'),
//     branchController.deleteBranch
//   );

// router
//   .route('/:id/restore')
//   .patch(
//     authController.restrictTo('update_branches', 'superadmin'),
//     branchController.restoreBranch
//   );

// module.exports = router;