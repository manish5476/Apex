const express = require('express');
const router = express.Router();
const designationController = require('../../controllers/core/designation.controller');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../../config/permissions");

const { validateDesignation } = require('../../middleware/validators');

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. ORGANIZATIONAL STRUCTURE (Read Access)
// ======================================================

// Get the reporting hierarchy of job titles
router.get('/hierarchy', 
  checkPermission(PERMISSIONS.DESIGNATION.READ), 
  designationController.getDesignationHierarchy
);

// Get the visual career progression for a specific role
router.get('/career-path/:id', 
  checkPermission(PERMISSIONS.DESIGNATION.READ), 
  designationController.getCareerPath
);

// ======================================================
// 2. HR & COMPENSATION (Manage Access)
// ======================================================

// ⚠️ Highly Sensitive: View/Manage salary ranges for job titles
router.get('/salary-bands', 
  checkPermission(PERMISSIONS.DESIGNATION.MANAGE), 
  designationController.getSalaryBands
);

// List employees eligible for promotion based on tenure/KPIs
router.get('/promotion-eligible', 
  checkPermission(PERMISSIONS.DESIGNATION.MANAGE), 
  designationController.getPromotionEligible
);

// Bulk administrative tool
router.post('/bulk', 
  checkPermission(PERMISSIONS.DESIGNATION.MANAGE), 
  designationController.bulkCreateDesignations
);

// ======================================================
// 3. CORE CRUD & EMPLOYEE LISTING
// ======================================================

router.route('/')
  .get(checkPermission(PERMISSIONS.DESIGNATION.READ), designationController.getAllDesignations)
  .post(
    checkPermission(PERMISSIONS.DESIGNATION.MANAGE),
    validateDesignation, 
    designationController.createDesignation
  );

// Get list of employees currently holding this designation
router.get('/:id/employees', 
  checkPermission(PERMISSIONS.DESIGNATION.READ), 
  designationController.getDesignationEmployees
);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.DESIGNATION.READ), designationController.getDesignation)
  .patch(
    checkPermission(PERMISSIONS.DESIGNATION.MANAGE),
    validateDesignation, 
    designationController.updateDesignation
  )
  .delete(
    checkPermission(PERMISSIONS.DESIGNATION.MANAGE), 
    designationController.deleteDesignation
  );

module.exports = router;