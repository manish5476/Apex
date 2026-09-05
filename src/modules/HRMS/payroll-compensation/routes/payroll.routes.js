'use strict';

const express = require('express');
const router = express.Router();

const payrollController = require('../controllers/payroll.controller');
const authController = require('../../../auth/core/auth.controller');
const { checkPermission } = require('../../../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../../../config/permissions');

router.use(authController.protect);

// Run payroll (Admin/HR only)
router.post('/runs', checkPermission(PERMISSIONS.PAYROLL.MANAGE), payrollController.runMonthlyPayroll);
router.patch('/payslips/bulk-status', checkPermission(PERMISSIONS.PAYROLL.MANAGE), payrollController.bulkUpdateStatus);

// Personal payslips (any employee can view their own)
router.get('/my-payslips', checkPermission(PERMISSIONS.PAYSLIP.VIEW_SELF), payrollController.getMyPayslips);

// All payslips (HR / Finance)
router.route('/payslips')
  .get(checkPermission(PERMISSIONS.PAYSLIP.VIEW_ALL), payrollController.getPayslipList);

router.route('/payslips/:id')
  .get(checkPermission(PERMISSIONS.PAYSLIP.VIEW_ALL), payrollController.getPayslip)
  .patch(checkPermission(PERMISSIONS.PAYROLL.MANAGE), payrollController.updatePayslipStatus);

module.exports = router;