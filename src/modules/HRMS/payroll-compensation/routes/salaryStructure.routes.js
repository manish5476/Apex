'use strict';

const express = require('express');
const router = express.Router();

const salaryStructureController = require('../controllers/salaryStructure.controller');
const authController = require('../../../auth/core/auth.controller');
const { checkPermission } = require('../../../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../../../config/permissions');

router.use(authController.protect);

router.route('/')
  .get(checkPermission(PERMISSIONS.PAYROLL.READ), salaryStructureController.getAllSalaryStructures)
  .post(checkPermission(PERMISSIONS.PAYROLL.MANAGE), salaryStructureController.createSalaryStructure);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.PAYROLL.READ), salaryStructureController.getSalaryStructure)
  .patch(checkPermission(PERMISSIONS.PAYROLL.MANAGE), salaryStructureController.updateSalaryStructure)
  .delete(checkPermission(PERMISSIONS.PAYROLL.MANAGE), salaryStructureController.deleteSalaryStructure);

module.exports = router;