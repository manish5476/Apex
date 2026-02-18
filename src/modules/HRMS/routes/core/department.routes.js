// routes/core/department.routes.js
const express = require('express');
const router = express.Router();
const departmentController = require('../../controllers/core/department.controller');
const { protect, restrictTo } = require('../../middleware/auth');
const { validateDepartment } = require('../../middleware/validators');

// All routes require authentication
router.use(protect);

// Special routes first (to avoid :id conflicts)
router.get('/hierarchy', departmentController.getDepartmentHierarchy);
router.get('/stats/summary', departmentController.getDepartmentStats);
router.post('/bulk', restrictTo('admin', 'hr'), departmentController.bulkUpdateDepartments);

// Standard CRUD routes
router.route('/')
  .get(departmentController.getAllDepartments)
  .post(
    restrictTo('admin', 'hr'),
    validateDepartment,
    departmentController.createDepartment
  );

router.route('/:id')
  .get(departmentController.getDepartment)
  .patch(
    restrictTo('admin', 'hr'),
    validateDepartment,
    departmentController.updateDepartment
  )
  .delete(restrictTo('admin'), departmentController.deleteDepartment);

// Department employees
router.get('/:id/employees', departmentController.getDepartmentEmployees);

module.exports = router;