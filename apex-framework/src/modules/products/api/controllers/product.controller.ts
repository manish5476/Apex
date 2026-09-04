const productService = require('../../application/services/product.service');
const catchAsync = require('../../../../core/catchAsync');

/**
 * Controllers do ONE thing: translate HTTP <-> service calls.
 * No business logic here. If you're writing an `if` that isn't about
 * request/response shape, it belongs in the service instead.
 */

exports.create = catchAsync(async (req, res) => {
  const product = await productService.create(req.body);
  res.status(201).json({ success: true, data: product });
});

exports.getOne = catchAsync(async (req, res) => {
  const product = await productService.getById(req.params.id);
  res.json({ success: true, data: product });
});

exports.list = catchAsync(async (req, res) => {
  const { page, limit, sort, category, isActive } = req.query;
  const filters = {};
  if (category) filters.category = category;
  if (isActive !== undefined) filters.isActive = isActive === 'true';

  const result = await productService.list(filters, { page, limit, sort });
  res.json({ success: true, ...result });
});

exports.update = catchAsync(async (req, res) => {
  const product = await productService.update(req.params.id, req.body);
  res.json({ success: true, data: product });
});

exports.remove = catchAsync(async (req, res) => {
  await productService.remove(req.params.id);
  res.status(204).send();
});

exports.reduceStock = catchAsync(async (req, res) => {
  const product = await productService.reduceStock(req.params.id, req.body.quantity);
  res.json({ success: true, data: product });
});

exports.search = catchAsync(async (req, res) => {
  const { q, page, limit } = req.query;
  const result = await productService.search(q, { page, limit });
  res.json({ success: true, ...result });
});
