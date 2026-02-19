// routes/core/department.routes.js
const express = require('express');
const router = express.Router();
const departmentController = require('../../controllers/core/department.controller');
const { protect, restrictTo } = require('../../middleware/auth');
const { validateDepartment } = require('../../middleware/validators');
const authController = require("../../../auth/core/auth.controller");

// All routes require authentication
router.use(authController.protect);

// Special routes first (to avoid :id conflicts)
router.get('/hierarchy', departmentController.getDepartmentHierarchy);
router.get('/stats/summary', departmentController.getDepartmentStats);
router.post('/bulk',  departmentController.bulkUpdateDepartments);

// Standard CRUD routes
router.route('/')
  .get(departmentController.getAllDepartments)
  .post(
    
    validateDepartment,
    departmentController.createDepartment
  );

router.route('/:id')
  .get(departmentController.getDepartment)
  .patch(
    
    validateDepartment,
    departmentController.updateDepartment
  )
  .delete( departmentController.deleteDepartment);

// Department employees
router.get('/:id/employees', departmentController.getDepartmentEmployees);

module.exports = router;