'use strict';

const express = require('express');
const router = express.Router();

const employeeController = require('../controllers/employee.controller');
const authController = require('../../../auth/core/auth.controller');
const { checkPermission } = require('../../../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../../../config/permissions');

router.use(authController.protect);

// Self-service endpoint: authenticated user gets their own employee profile (no admin permission needed)
router.get('/me/profile', employeeController.getMyProfile);

// Query by User ID
router.get('/by-user/:userId', checkPermission(PERMISSIONS.EMPLOYEE.READ), employeeController.getEmployeeByUser);

// 360 Workspace (supports both /workspace/:id and /:id/workspace)
router.get('/workspace/:id', checkPermission(PERMISSIONS.EMPLOYEE.READ), employeeController.getEmployeeWorkspace);
router.get('/:id/workspace', checkPermission(PERMISSIONS.EMPLOYEE.READ), employeeController.getEmployeeWorkspace);

// Provision / Invite login user account for unlinked employee
router.post('/:id/invite-user', checkPermission(PERMISSIONS.EMPLOYEE.MANAGE), employeeController.inviteUserForEmployee);

// Offboarding / Deactivate
router.patch('/:id/deactivate', checkPermission(PERMISSIONS.EMPLOYEE.MANAGE), employeeController.deactivateEmployee);

// Root collection routes
router.route('/')
  .get(checkPermission(PERMISSIONS.EMPLOYEE.READ), employeeController.getAllEmployees)
  .post(checkPermission(PERMISSIONS.EMPLOYEE.MANAGE), employeeController.createEmployee);

// Individual employee CRUD
router.route('/:id')
  .get(checkPermission(PERMISSIONS.EMPLOYEE.READ), employeeController.getEmployee)
  .patch(checkPermission(PERMISSIONS.EMPLOYEE.MANAGE), employeeController.updateEmployee);

module.exports = router;
