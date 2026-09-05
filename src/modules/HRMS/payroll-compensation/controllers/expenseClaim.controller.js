'use strict';

const catchAsync = require('../../../../core/utils/api/catchAsync');
const expenseClaimService = require('../services/expenseClaim.service');
const { success, created, noContent } = require('../../middleware/responseFormatter');

exports.getAllExpenseClaims = catchAsync(async (req, res) => {
  const result = await expenseClaimService.getList(req.user.organizationId, req.query, req.user);

  res.status(200).json({
    status: 'success',
    results: result.results,
    pagination: result.pagination,
    data: { expenseClaims: result.data },
  });
});

exports.getExpenseClaim = catchAsync(async (req, res) => {
  const claim = await expenseClaimService.getById(req.user.organizationId, req.params.id);
  return success(res, { expenseClaim: claim });
});

exports.createExpenseClaim = catchAsync(async (req, res) => {
  const claim = await expenseClaimService.create(
    req.user.organizationId,
    req.body,
    req.user
  );

  return created(res, { expenseClaim: claim });
});

exports.updateExpenseClaim = catchAsync(async (req, res) => {
  const claim = await expenseClaimService.update(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user
  );

  return success(res, { expenseClaim: claim });
});

exports.approveExpenseClaim = catchAsync(async (req, res) => {
  const claim = await expenseClaimService.approve(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user
  );

  return success(res, { expenseClaim: claim });
});

exports.rejectExpenseClaim = catchAsync(async (req, res) => {
  const claim = await expenseClaimService.reject(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user
  );

  return success(res, { expenseClaim: claim });
});

exports.deleteExpenseClaim = catchAsync(async (req, res) => {
  await expenseClaimService.delete(req.user.organizationId, req.params.id, req.user);
  return noContent(res);
});