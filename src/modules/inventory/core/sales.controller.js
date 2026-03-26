'use strict';

const ProductService = require('./service/product.service');
const Sales = require('./model/sales.model');
const StockService   = require('./service/stock.service');
const factory            = require('../../../core/utils/api/handlerFactory');
const catchAsync     = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');

/* ======================================================
   1. CREATE SALE
====================================================== */
exports.createSale = catchAsync(async (req, res, next) => {
  const sale = await SalesService.createSale(req.body, req.user);

  res.status(201).json({
    status: 'success',
    data:   { sale },
  });
});

/* ======================================================
   2. UPDATE SALE
====================================================== */
exports.updateSale = catchAsync(async (req, res, next) => {
  const sale = await SalesService.updateSale(req.params.id, req.body, req.user);

  res.status(200).json({
    status: 'success',
    data:   { sale },
  });
});

/* ======================================================
   3. DELETE SALE
====================================================== */
exports.deleteSale = catchAsync(async (req, res, next) => {
  await SalesService.deleteSale(req.params.id, req.user);

  res.status(200).json({
    status:  'success',
    message: 'Sale deleted successfully',
  });
});

/* ======================================================
   4. READ-ONLY (factory-powered)
====================================================== */
exports.getAllSales = factory.getAll(Sales);
exports.getSale     = factory.getOne(Sales);
exports.getSalesStats = factory.getStats(Sales);
exports.exportSales = factory.exportData(Sales);