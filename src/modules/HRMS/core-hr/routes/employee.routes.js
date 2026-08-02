const express = require('express');
const router = express.Router();

const employeeController = require('../controllers/employee.controller');
const authController = require('../../../auth/core/auth.controller');
const { checkPermission } = require('../../../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../../../config/permissions');

router.use(authController.protect);

router.get('/by-user/:userId', checkPermission(PERMISSIONS.USER.READ), employeeController.getEmployeeByUser);

router.route('/')
  .get(checkPermission(PERMISSIONS.USER.READ), employeeController.getAllEmployees)
  .post(checkPermission(PERMISSIONS.USER.MANAGE), employeeController.createEmployee);

router.patch('/:id/deactivate', checkPermission(PERMISSIONS.USER.MANAGE), employeeController.deactivateEmployee);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.USER.READ), employeeController.getEmployee)
  .patch(checkPermission(PERMISSIONS.USER.MANAGE), employeeController.updateEmployee);

module.exports = router;
