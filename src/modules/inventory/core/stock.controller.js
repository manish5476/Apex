'use strict';

/**
 * Stock Controller  (legacy standalone stock operations)
 * ─────────────────────────────────────────────
 * These endpoints existed as a separate standalone controller
 * alongside the product controller. They are now thin wrappers
 * that route through StockService and JournalService.
 *
 * Note: The same operations also exist inside ProductService
 * (adjustStock, transferStock). These endpoints are kept for
 * backward-compatibility with existing routes but delegate to
 * the same shared services.
 */

const Product = require('./model/product.model');
const StockService = require('./service/stock.service');
const JournalService = require('./service/Journal.service');

const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const { runInTransaction } = require('../../../core/utils/db/runInTransaction');

/* ======================================================
   1. STOCK TRANSFER (inter-branch, no GL entries)

   FIX: Original fetched the whole product document,
   mutated the embedded array in memory, then called save().
   This is not atomic — a concurrent request could read stale
   inventory between the find and save.
   Now routes through StockService which uses $inc + $elemMatch
   in a single findOneAndUpdate (atomic).
====================================================== */
exports.transferStock = catchAsync(async (req, res, next) => {
  const { productId, fromBranchId, toBranchId, quantity } = req.body;

  if (!productId) return next(new AppError('productId is required', 400));
  if (!fromBranchId || !toBranchId) return next(new AppError('fromBranchId and toBranchId are required', 400));
  if (String(fromBranchId) === String(toBranchId)) return next(new AppError('Source and destination cannot be the same branch', 400));
  const qty = Number(quantity);
  if (!qty || qty <= 0) return next(new AppError('quantity must be a positive number', 400));

  await runInTransaction(async (session) => {
    // Verify product belongs to this org before moving its stock
    const exists = await Product.exists({
      _id: productId, organizationId: req.user.organizationId,
    }).session(session);
    if (!exists) throw new AppError('Product not found', 404);

    await StockService.transfer({
      productId,
      fromBranchId,
      toBranchId,
      quantity: qty,
      organizationId: req.user.organizationId,
    }, session);

  }, 3, { action: 'TRANSFER_STOCK', userId: req.user._id });

  res.status(200).json({
    status: 'success',
    message: 'Stock transferred successfully',
  });
});

/* ======================================================
   2. STOCK ADJUSTMENT (add / subtract with GL entries)

   FIX #1: Original used save() on a fetched document — not atomic.
   FIX #2: referenceType was 'adjustment' which failed enum validation.
   FIX #3: getOrInitAccount had a race condition on parallel requests.
   All three fixed by routing through StockService + JournalService.
====================================================== */
exports.adjustStock = catchAsync(async (req, res, next) => {
  const { productId, branchId, type, quantity, reason } = req.body;

  if (!productId) return next(new AppError('productId is required', 400));
  if (!['add', 'subtract'].includes(type)) return next(new AppError('type must be "add" or "subtract"', 400));
  const qty = Number(quantity);
  if (!qty || qty <= 0) return next(new AppError('quantity must be a positive number', 400));

  let product;

  await runInTransaction(async (session) => {
    const targetBranch = branchId || req.user.branchId;
    const item = { productId, quantity: qty };

    if (type === 'subtract') {
      // StockService.decrement validates availability before any DB write
      await StockService.decrement([item], targetBranch, req.user.organizationId, session);
    } else {
      await StockService.increment([item], targetBranch, req.user.organizationId, session);
    }

    product = await Product.findOne({
      _id: productId, organizationId: req.user.organizationId,
    }).session(session);

    if (!product) throw new AppError('Product not found after stock update', 500);

    // Post GL entries via JournalService
    await JournalService.postStockAdjustmentJournal({
      orgId: req.user.organizationId,
      branchId: targetBranch,
      product,
      quantity: qty,
      type,
      reason: reason || `Stock ${type === 'add' ? 'addition' : 'reduction'}`,
      userId: req.user._id,
      session,
    });

  }, 3, { action: 'ADJUST_STOCK', userId: req.user._id });

  res.status(200).json({
    status: 'success',
    data: { product },
  });
});
