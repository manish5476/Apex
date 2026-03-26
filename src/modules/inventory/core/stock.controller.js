'use strict';

const ProductService = require('./service/product.service');
const StockService   = require('./service/stock.service');
const factory            = require('../../../core/utils/api/handlerFactory');
const catchAsync     = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');

/* ======================================================
   1. STOCK ADJUSTMENT
====================================================== */
exports.adjustStock = catchAsync(async (req, res, next) => {
  const { type, quantity, reason, branchId } = req.body;

  if (!type || !quantity) {
    return next(new AppError('type and quantity are required', 400));
  }

  const product = await StockService.adjustStock(
    req.params.id,
    { type, quantity, reason, branchId },
    req.user
  );

  res.status(200).json({
    status: 'success',
    data:   { product },
  });
});

/* ======================================================
   2. STOCK TRANSFER (inter-branch)
====================================================== */
exports.transferStock = catchAsync(async (req, res, next) => {
  const { fromBranchId, toBranchId, quantity } = req.body;

  if (!fromBranchId || !toBranchId || !quantity) {
    return next(new AppError('fromBranchId, toBranchId and quantity are required', 400));
  }

  await StockService.transferStock(
    req.params.id,
    { fromBranchId, toBranchId, quantity },
    req.user
  );

  res.status(200).json({
    status:  'success',
    message: 'Stock transferred successfully',
  });
});

/* ======================================================
   3. GET STOCK VALUE (branch-level cost report)
====================================================== */
exports.getStockValue = catchAsync(async (req, res, next) => {
  const branchId = req.query.branchId || req.user.branchId;
  const value    = await StockService.getStockValue(branchId, req.user.organizationId);

  res.status(200).json({
    status: 'success',
    data:   { branchId, totalStockValue: value },
  });
});
