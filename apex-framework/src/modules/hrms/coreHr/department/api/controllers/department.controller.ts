const departmentService = require('../../application/services/department.service');
const catchAsync = require('../../../../../../core/catchAsync');

exports.create = catchAsync(async (req, res) => {
  const entity = await departmentService.create(req.body);
  res.status(201).json({ success: true, data: entity });
});

exports.getOne = catchAsync(async (req, res) => {
  const entity = await departmentService.getById(req.params.id);
  res.json({ success: true, data: entity });
});

exports.list = catchAsync(async (req, res) => {
  const { page, limit, sort } = req.query;
  const result = await departmentService.list({}, { page, limit, sort });
  res.json({ success: true, ...result });
});

exports.update = catchAsync(async (req, res) => {
  const entity = await departmentService.update(req.params.id, req.body);
  res.json({ success: true, data: entity });
});

exports.remove = catchAsync(async (req, res) => {
  await departmentService.remove(req.params.id);
  res.status(204).send();
});
