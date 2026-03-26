// 'use strict';

// /**
//  * Sales Controller
//  * ─────────────────────────────────────────────
//  * Thin HTTP layer only. No business logic here.
//  *   1. Parse / validate HTTP input
//  *   2. Call SalesService
//  *   3. Send HTTP response
//  *
//  * Key fixes vs original:
//  *   - deleteSales routes through SalesService.remove (stock + COGS reversed)
//  *   - updateSales blocks financial fields + routes through SalesService.update
//  *   - getSalesStats always scoped to organizationId
//  *   - exportSales always scoped to organizationId
//  */

// const mongoose = require('mongoose');
// const Sales = require('../model/sales.model');
// const SalesService = require('../../../../services/billing/salesService');

// const factory = require('../../../core/utils/api/handlerFactory');
// const catchAsync = require('../../../core/utils/api/catchAsync');
// const AppError = require('../../../core/utils/api/appError');
// const { createSalesSchema, updateSalesSchema } = require('../../../core/middleware/salesValidation');

'use strict';

/**
 * Sales Controller
 * ─────────────────────────────────────────────
 * Thin HTTP layer only. No business logic here.
 * 1. Parse / validate HTTP input
 * 2. Call SalesService
 * 3. Send HTTP response
 */

const mongoose = require('mongoose');

// Internal module imports (Inventory) - These are in subfolders right next to this controller
const Sales = require('./model/sales.model');
const SalesService = require('./service/sales.service');

// Core utilities (Requires going up 3 levels: core -> inventory -> modules -> src)
const factory = require('../../../core/utils/api/handlerFactory');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const { createSalesSchema, updateSalesSchema } = require('../../../core/middleware/salesValidation');
/* ======================================================
   POPULATE CONFIG
====================================================== */
const SALES_POPULATE = [
  { path: 'customerId', select: 'name phone email' },
  { path: 'invoiceId', select: 'invoiceNumber grandTotal status' },
  { path: 'branchId', select: 'name code' },
  { path: 'items.productId', select: 'name sku' },
];

/* ======================================================
   1. CREATE SALE (manual / POS)
====================================================== */
exports.createSales = catchAsync(async (req, res, next) => {
  const { error, value } = createSalesSchema.validate(req.body);
  if (error) return next(new AppError(error.message, 400));

  const data = {
    ...value,
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    createdBy: req.user._id,
  };

  const sale = await SalesService.create(data);

  res.status(201).json({
    status: 'success',
    data: { data: sale },
  });
});

/* ======================================================
   2. CREATE FROM INVOICE
====================================================== */
exports.createFromInvoice = catchAsync(async (req, res, next) => {
  const { invoiceId } = req.params;

  const sale = await SalesService.createFromInvoice(invoiceId, req.user.organizationId);
  if (!sale) return next(new AppError('Could not create sale from this invoice', 400));

  res.status(201).json({
    status: 'success',
    data: { data: sale },
  });
});

/* ======================================================
   3. GET ALL SALES
   Factory-powered but always scoped to org via middleware.
   Verify your factory.getAll reads organizationId from req.user.
====================================================== */
exports.getAllSales = factory.getAll(Sales, {
  populate: SALES_POPULATE,
  searchFields: ['invoiceNumber', 'notes', 'status'],
});

/* ======================================================
   4. GET ONE SALE
====================================================== */
exports.getSales = factory.getOne(Sales, { populate: SALES_POPULATE });

/* ======================================================
   5. UPDATE SALE
   FIX: Was calling factory.updateOne(Sales) directly which
   bypasses all business logic. Now routes through SalesService
   which blocks financial fields and validates org scope.
====================================================== */
exports.updateSales = catchAsync(async (req, res, next) => {
  const { error, value } = updateSalesSchema.validate(req.body);
  if (error) return next(new AppError(error.message, 400));

  const sale = await SalesService.update(req.params.id, value, req.user.organizationId);

  res.status(200).json({
    status: 'success',
    data: { data: sale },
  });
});

/* ======================================================
   6. DELETE / CANCEL SALE
   FIX: Was factory.deleteOne(Sales) which just removes the document.
   Stock was never restored, COGS never reversed, customer balance
   never updated. Now routes through SalesService.remove.
====================================================== */
exports.deleteSales = catchAsync(async (req, res, next) => {
  await SalesService.remove(req.params.id, req.user.organizationId);

  res.status(200).json({
    status: 'success',
    message: 'Sale cancelled and reversed successfully',
    data: null,
  });
});

/* ======================================================
   7. GET SALES STATS
   FIX: factory.getStats had no org scoping — any user could
   see all orgs' totals. Now uses an explicit scoped aggregation.
====================================================== */
exports.getSalesStats = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
    status: { $ne: 'cancelled' },
  };

  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  const stats = await Sales.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        totalPaid: { $sum: '$paidAmount' },
        totalDue: { $sum: '$dueAmount' },
      },
    },
    {
      $group: {
        _id: null,
        byStatus: { $push: { status: '$_id', count: '$count', total: '$totalAmount' } },
        grandTotal: { $sum: '$totalAmount' },
        grandCount: { $sum: '$count' },
        totalPaid: { $sum: '$totalPaid' },
        totalDue: { $sum: '$totalDue' },
      },
    },
    { $project: { _id: 0, byStatus: 1, grandTotal: 1, grandCount: 1, totalPaid: 1, totalDue: 1 } },
  ]);

  res.status(200).json({
    status: 'success',
    data: { stats: stats[0] || {} },
  });
});

/* ======================================================
   8. EXPORT SALES
   FIX: factory.exportData had no org scoping.
   Now uses a scoped query with pagination.
====================================================== */
exports.exportSales = catchAsync(async (req, res, next) => {
  const { startDate, endDate, status, limit = 1000 } = req.query;

  const filter = {
    organizationId: req.user.organizationId,
  };

  if (status) filter.status = status;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const sales = await Sales.find(filter)
    .populate(SALES_POPULATE)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit), 5000)) // hard cap
    .lean();

  res.status(200).json({
    status: 'success',
    results: sales.length,
    data: { sales },
  });
});

/* ======================================================
   9. AGGREGATE TOTALS
====================================================== */
exports.aggregateTotals = catchAsync(async (req, res, next) => {
  const totals = await SalesService.aggregateTotal(req.user.organizationId);

  res.status(200).json({
    status: 'success',
    data: { totals },
  });
});

// 'use strict';

// const SalesService = require('./service/sales.service');
// const Sales = require('./model/sales.model');
// const factory = require('../../../core/utils/api/handlerFactory');
// const catchAsync = require('../../../core/utils/api/catchAsync');
// const AppError = require('../../../core/utils/api/appError');

// /* ======================================================
//    1. CREATE SALE
// ====================================================== */
// exports.createSale = catchAsync(async (req, res, next) => {
//   const sale = await SalesService.createSale(req.body, req.user);
//   res.status(201).json({
//     status: 'success',
//     data: { sale },
//   });
// });

// /* ======================================================
//    2. UPDATE SALE
// ====================================================== */
// exports.updateSale = catchAsync(async (req, res, next) => {
//   const sale = await SalesService.updateSale(req.params.id, req.body, req.user);

//   res.status(200).json({
//     status: 'success',
//     data: { sale },
//   });
// });

// /* ======================================================
//    3. DELETE SALE
// ====================================================== */
// exports.deleteSale = catchAsync(async (req, res, next) => {
//   await SalesService.deleteSale(req.params.id, req.user);

//   res.status(200).json({
//     status: 'success',
//     message: 'Sale deleted successfully',
//   });
// });

// /* ======================================================
//    4. READ-ONLY (factory-powered)
// ====================================================== */
// exports.getAllSales = factory.getAll(Sales);
// exports.getSale = factory.getOne(Sales);
// exports.getSalesStats = factory.getStats(Sales);
// exports.exportSales = factory.exportData(Sales);