const catchAsync = require('../../../core/utils/api/catchAsync');
const assetService = require('../services/companyAsset/companyAsset.service');
const { createAssetSchema, updateAssetSchema, assignAssetSchema, returnAssetSchema } = require('../validation/companyAsset.validation');
const { success, created } = require('../../../middleware/responseFormatter');

exports.getAllAssets = catchAsync(async (req, res) => {
  const result = await assetService.getList(req.user.organizationId, req.query);
  return success(res, result.data, 200, result.pagination);
});

exports.getAsset = catchAsync(async (req, res) => {
  const asset = await assetService.getById(req.user.organizationId, req.params.id);
  return success(res, { asset });
});

exports.createAsset = catchAsync(async (req, res) => {
  const data = createAssetSchema.parse(req.body);
  const asset = await assetService.create(req.user.organizationId, data, req.user._id);
  return created(res, { asset });
});

exports.updateAsset = catchAsync(async (req, res) => {
  const data = updateAssetSchema.parse(req.body);
  const asset = await assetService.update(req.user.organizationId, req.params.id, data, req.user._id);
  return success(res, { asset });
});

exports.assignAsset = catchAsync(async (req, res) => {
  const data = assignAssetSchema.parse(req.body);
  const asset = await assetService.assignAsset(req.user.organizationId, req.params.id, data, req.user._id);
  return success(res, { asset, message: 'Asset assigned successfully' });
});

exports.returnAsset = catchAsync(async (req, res) => {
  const data = returnAssetSchema.parse(req.body);
  const asset = await assetService.returnAsset(req.user.organizationId, req.params.id, data, req.user._id);
  return success(res, { asset, message: 'Asset returned successfully' });
});