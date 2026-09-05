'use strict';

const catchAsync = require('../../../../core/utils/api/catchAsync');
const payrollService = require('../services/payroll.service');
const { success, created } = require('../../middleware/responseFormatter');

exports.runMonthlyPayroll = catchAsync(async (req, res) => {
  const result = await payrollService.runMonthlyPayroll(
    req.user.organizationId,
    req.body,
    req.user._id
  );

  return created(res, result);
});

exports.getPayslipList = catchAsync(async (req, res) => {
  const result = await payrollService.getPayslipList(req.user.organizationId, req.query);

  res.status(200).json({
    status: 'success',
    results: result.results,
    pagination: result.pagination,
    data: { payslips: result.data },
  });
});

exports.getMyPayslips = catchAsync(async (req, res) => {
  const query = { ...req.query, user: req.user._id };
  const result = await payrollService.getPayslipList(req.user.organizationId, query);

  res.status(200).json({
    status: 'success',
    results: result.results,
    pagination: result.pagination,
    data: { payslips: result.data },
  });
});

exports.getPayslip = catchAsync(async (req, res) => {
  const payslip = await payrollService.getById(req.user.organizationId, req.params.id);
  return success(res, { payslip });
});

exports.updatePayslipStatus = catchAsync(async (req, res) => {
  const payslip = await payrollService.updateStatus(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user._id
  );

  return success(res, { payslip });
});

exports.bulkUpdateStatus = catchAsync(async (req, res) => {
  const result = await payrollService.bulkUpdateStatus(
    req.user.organizationId,
    req.body,
    req.user._id
  );

  return success(res, result);
});