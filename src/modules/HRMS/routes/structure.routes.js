const express = require("express");
const router = express.Router();
const structureController = require("../controllers/structure.controller");
const authController = require("../../auth/core/auth.controller"); // Adjust path if needed

// Protect all routes
router.use(authController.protect);

// ======================================================
//  DEPARTMENTS
// ======================================================
router.route("/departments")
  .get(structureController.getAllDepartments)
  .post(
    authController.restrictTo('superadmin', 'admin', 'hr'), 
    structureController.createDepartment
  );

router.route("/departments/:id")
  .patch(
    authController.restrictTo('superadmin', 'admin', 'hr'), 
    structureController.updateDepartment
  )
  .delete(
    authController.restrictTo('superadmin', 'admin', 'hr'), 
    structureController.deleteDepartment
  );

// ======================================================
//  DESIGNATIONS
// ======================================================
router.route("/designations")
  .get(structureController.getAllDesignations)
  .post(
    authController.restrictTo('superadmin', 'admin', 'hr'), 
    structureController.createDesignation
  );

router.route("/designations/:id")
  .patch(
    authController.restrictTo('superadmin', 'admin', 'hr'), 
    structureController.updateDesignation
  )
  .delete(
    authController.restrictTo('superadmin', 'admin', 'hr'), 
    structureController.deleteDesignation
  );

module.exports = router;