'use strict';

const ProductService = require('./service/product.service');
const StockService       = require('./service/stock.service');
const factory            = require('../../../core/utils/api/handlerFactory');
const catchAsync     = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');

/* ======================================================
   1. CREATE PURCHASE
====================================================== */
exports.createPurchase = catchAsync(async (req, res, next) => {
  const purchase = await PurchaseService.createPurchase(req.body, req.user);

  res.status(201).json({
    status: 'success',
    data:   { purchase },
  });
});

/* ======================================================
   2. UPDATE PURCHASE
====================================================== */
exports.updatePurchase = catchAsync(async (req, res, next) => {
  const purchase = await PurchaseService.updatePurchase(
    req.params.id, req.body, req.user
  );

  res.status(200).json({
    status: 'success',
    data:   { purchase },
  });
});

/* ======================================================
   3. DELETE PURCHASE
====================================================== */
exports.deletePurchase = catchAsync(async (req, res, next) => {
  await PurchaseService.deletePurchase(req.params.id, req.user);

  res.status(200).json({
    status:  'success',
    message: 'Purchase deleted successfully',
  });
});

/* ======================================================
   4. READ-ONLY (factory-powered)
====================================================== */
exports.getAllPurchases = factory.getAll(Purchase);
exports.getPurchase     = factory.getOne(Purchase);
