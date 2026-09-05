'use strict';

const catchAsync = require('../../../../core/utils/api/catchAsync');
const salaryStructureService = require('../services/salaryStructure.service');
const { success, created, noContent } = require('../../middleware/responseFormatter');

exports.getAllSalaryStructures = catchAsync(async (req, res) => {
  const result = await salaryStructureService.getList(req.user.organizationId, req.query);

  res.status(200).json({
    status: 'success',
    results: result.results,
    pagination: result.pagination,
    data: { salaryStructures: result.data },
  });
});

exports.getSalaryStructure = catchAsync(async (req, res) => {
  const structure = await salaryStructureService.getById(req.user.organizationId, req.params.id);
  return success(res, { salaryStructure: structure });
});

exports.createSalaryStructure = catchAsync(async (req, res) => {
  const structure = await salaryStructureService.create(
    req.user.organizationId,
    req.body,
    req.user._id
  );

  return created(res, { salaryStructure: structure });
});

exports.updateSalaryStructure = catchAsync(async (req, res) => {
  const structure = await salaryStructureService.update(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user._id
  );

  return success(res, { salaryStructure: structure });
});

exports.deleteSalaryStructure = catchAsync(async (req, res) => {
  await salaryStructureService.delete(req.user.organizationId, req.params.id);
  return noContent(res);
});