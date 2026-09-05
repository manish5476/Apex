'use strict';

const express = require('express');
const router = express.Router();

const expenseClaimController = require('../controllers/expenseClaim.controller');
const authController = require('../../../auth/core/auth.controller');
const { checkPermission } = require('../../../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../../../config/permissions');

router.use(authController.protect);

router.route('/')
  .get(checkPermission(PERMISSIONS.EXPENSE.CLAIM), expenseClaimController.getAllExpenseClaims)
  .post(checkPermission(PERMISSIONS.EXPENSE.CLAIM), expenseClaimController.createExpenseClaim);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.EXPENSE.CLAIM), expenseClaimController.getExpenseClaim)
  .patch(checkPermission(PERMISSIONS.EXPENSE.CLAIM), expenseClaimController.updateExpenseClaim)
  .delete(checkPermission(PERMISSIONS.EXPENSE.CLAIM), expenseClaimController.deleteExpenseClaim);

router.patch('/:id/approve', checkPermission(PERMISSIONS.EXPENSE.APPROVE), expenseClaimController.approveExpenseClaim);
router.patch('/:id/reject', checkPermission(PERMISSIONS.EXPENSE.APPROVE), expenseClaimController.rejectExpenseClaim);

module.exports = router;