'use strict';

/**
 * Sales Return Controller
 * ─────────────────────────────────────────────
 * Thin HTTP layer only.
 *   1. Parse / validate HTTP input
 *   2. Call SalesReturnService
 *   3. Send HTTP response
 */

const SalesReturnService = require('./service/salesReturn.service');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');

/* ======================================================
   1. CREATE RETURN  (status: pending)
====================================================== */
exports.createReturn = catchAsync(async (req, res, next) => {
  const { invoiceId, items, reason, notes } = req.body;

  if (!invoiceId) return next(new AppError('invoiceId is required', 400));
  if (!Array.isArray(items) || !items.length) {
    return next(new AppError('items array is required', 400));
  }
  if (!reason?.trim()) {
    return next(new AppError('reason is required', 400));
  }

  const salesReturn = await SalesReturnService.createReturn(
    { invoiceId, items, reason, notes },
    req.user
  );

  res.status(201).json({
    status: 'success',
    message: 'Sales return created and pending approval',
    data: { salesReturn },
  });
});

/* ======================================================
   2. APPROVE RETURN  (triggers stock restore + ledger)
====================================================== */
exports.approveReturn = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  const salesReturn = await SalesReturnService.approveReturn(
    req.params.id,
    reason,
    req.user
  );

  res.status(200).json({
    status: 'success',
    message: 'Return approved. Stock restored and credit note posted.',
    data: { salesReturn },
  });
});

/* ======================================================
   3. REJECT RETURN
====================================================== */
exports.rejectReturn = catchAsync(async (req, res, next) => {
  const { rejectionReason } = req.body;

  if (!rejectionReason?.trim()) {
    return next(new AppError('rejectionReason is required', 400));
  }

  const salesReturn = await SalesReturnService.rejectReturn(
    req.params.id,
    rejectionReason,
    req.user
  );

  res.status(200).json({
    status: 'success',
    message: 'Return rejected',
    data: { salesReturn },
  });
});

/* ======================================================
   4. GET ALL RETURNS (paginated, filterable)
====================================================== */
exports.getReturns = catchAsync(async (req, res, next) => {
  const { status, customerId, invoiceId, startDate, endDate, page, limit } = req.query;

  const result = await SalesReturnService.getReturns(
    req.user.organizationId,
    { status, customerId, invoiceId, startDate, endDate },
    { page: Number(page) || 1, limit: Number(limit) || 20 }
  );

  res.status(200).json({
    status: 'success',
    results: result.returns.length,
    total: result.total,
    page: result.page,
    data: { returns: result.returns },
  });
});

/* ======================================================
   5. GET SINGLE RETURN
====================================================== */
exports.getReturn = catchAsync(async (req, res, next) => {
  const salesReturn = await SalesReturnService.getReturnById(
    req.params.id,
    req.user.organizationId
  );

  res.status(200).json({
    status: 'success',
    data: { salesReturn },
  });
});
