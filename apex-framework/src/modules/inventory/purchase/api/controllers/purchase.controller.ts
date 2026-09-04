const purchaseService = require('../../application/services/purchase.service');
const catchAsync = require('../../../../../core/catchAsync');

exports.create = catchAsync(async (req, res) => {
  const entity = await purchaseService.create(req.body);
  res.status(201).json({ success: true, data: entity });
});

exports.getOne = catchAsync(async (req, res) => {
  const entity = await purchaseService.getById(req.params.id);
  res.json({ success: true, data: entity });
});

exports.list = catchAsync(async (req, res) => {
  const { page, limit, sort } = req.query;
  const result = await purchaseService.list({}, { page, limit, sort });
  res.json({ success: true, ...result });
});

exports.update = catchAsync(async (req, res) => {
  const entity = await purchaseService.update(req.params.id, req.body);
  res.json({ success: true, data: entity });
});

exports.remove = catchAsync(async (req, res) => {
  await purchaseService.remove(req.params.id);
  res.status(204).send();
});
