const express = require('express');
const router = express.Router();
const departmentController = require('../../controllers/core/department.controller');
const authController = require("../../../auth/core/auth.controller");
const { checkPermission } = require("../../../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../../../config/permissions");

const { validateDepartment } = require('../../middleware/validators');

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. SPECIALIZED & AGGREGATE ROUTES (Must be before /:id)
// ======================================================

// Get tree structure of the organization
router.get('/hierarchy', 
  checkPermission(PERMISSIONS.DEPARTMENT.READ), 
  departmentController.getDepartmentHierarchy
);

// Get high-level stats (counts, budget utilization, etc.)
router.get('/stats/summary', 
  checkPermission(PERMISSIONS.DEPARTMENT.READ), 
  departmentController.getDepartmentStats
);

// Bulk updates (Admin only)
router.post('/bulk', 
  checkPermission(PERMISSIONS.DEPARTMENT.MANAGE), 
  departmentController.bulkUpdateDepartments
);

// ======================================================
// 2. COLLECTION ROUTES
// ======================================================

router.route('/')
  .get(checkPermission(PERMISSIONS.DEPARTMENT.READ), departmentController.getAllDepartments)
  .post(
    checkPermission(PERMISSIONS.DEPARTMENT.MANAGE),
    validateDepartment, 
    departmentController.createDepartment
  );

// ======================================================
// 3. MEMBER ROUTES (ID-BASED)
// ======================================================

// Get employees specifically assigned to this department
router.get('/:id/employees', 
  checkPermission(PERMISSIONS.DEPARTMENT.READ), 
  departmentController.getDepartmentEmployees
);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.DEPARTMENT.READ), departmentController.getDepartment)
  .patch(
    checkPermission(PERMISSIONS.DEPARTMENT.MANAGE),
    validateDepartment, 
    departmentController.updateDepartment
  )
  .delete(
    checkPermission(PERMISSIONS.DEPARTMENT.MANAGE), 
    departmentController.deleteDepartment
  );

module.exports = router;