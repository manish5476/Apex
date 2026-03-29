'use strict';

/**
 * Purchase Controller
 * ─────────────────────────────────────────────
 * This file is intentionally thin. Its only responsibilities are:
 * 1. Parse and validate HTTP input
 * 2. Call PurchaseService
 * 3. Send an HTTP response
 *
 * NO business logic, NO accounting entries, NO stock mutations here.
 * All of that lives in PurchaseService / StockService / JournalService.
 */

// Internal module imports (Inventory) - Down one level into subfolders
const PurchaseService = require('./service/purchase.service');
const Purchase = require('./model/purchase.model');
const PurchaseReturn = require('./model/purchase.return.model');

// Cross-module imports (Requires going up 2 levels: core -> inventory -> modules)
const Payment = require('../../accounting/payments/payment.model');
const imageUploadService = require('../../uploads/imageUploadService');

// Core utilities (Requires going up 3 levels: core -> inventory -> modules -> src)
const factory = require('../../../core/utils/api/handlerFactory');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
/* ======================================================
   POPULATE CONFIGS
====================================================== */
const PURCHASE_POPULATE = [
  { path: 'items.productId', select: 'name sku category sellingPrice' },
  { path: 'supplierId', select: 'name companyName email phone address' },
  { path: 'createdBy', select: 'name email' },
  { path: 'approvedBy', select: 'name email' },
  { path: 'branchId', select: 'name code' },
];

/* ======================================================
   1. CREATE PURCHASE
====================================================== */
exports.createPurchase = catchAsync(async (req, res, next) => {
  // Handle file uploads before the transaction (avoids holding DB locks
  // during Cloudinary network calls)
  let files = [];
  if (req.files?.length) {
    const assets = await imageUploadService.uploadMultipleAndRecord(
      req.files, req.user, 'invoice'
    );
    files = assets.map(a => ({
      url: a.url, public_id: a.publicId,
      format: a.mimeType, bytes: a.size, assetId: a._id,
    }));
  }

  const purchase = await PurchaseService.createPurchase(
    { ...req.body, files },
    req.user
  );

  res.status(201).json({
    status: 'success',
    message: 'Purchase recorded successfully',
    data: { purchase },
  });
});

/* ======================================================
   2. UPDATE PURCHASE
====================================================== */
exports.updatePurchase = catchAsync(async (req, res, next) => {
  // Handle new file uploads outside the transaction
  if (req.files?.length) {
    const assets = await imageUploadService.uploadMultipleAndRecord(
      req.files, req.user, 'invoice'
    );
    req.body.newFiles = assets.map(a => ({
      url: a.url, public_id: a.publicId,
      format: a.mimeType, bytes: a.size, assetId: a._id,
    }));
  }

  const purchase = await PurchaseService.updatePurchase(
    req.params.id,
    req.body,
    req.user
  );

  res.status(200).json({
    status: 'success',
    data: { purchase },
  });
});

/* ======================================================
   3. CANCEL PURCHASE
====================================================== */
exports.cancelPurchase = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  if (!reason?.trim()) {
    return next(new AppError('Cancellation reason is required', 400));
  }

  await PurchaseService.cancelPurchase(req.params.id, reason, req.user);

  res.status(200).json({
    status: 'success',
    message: 'Purchase cancelled successfully',
  });
});

/* ======================================================
   4. UPDATE STATUS
====================================================== */
exports.updateStatus = catchAsync(async (req, res, next) => {
  const { status, notes } = req.body;
  if (!status) return next(new AppError('Status is required', 400));

  await PurchaseService.updateStatus(req.params.id, status, notes, req.user);

  res.status(200).json({
    status: 'success',
    message: `Status updated to ${status}`,
  });
});

/* ======================================================
   5. RECORD PAYMENT
====================================================== */
exports.recordPayment = catchAsync(async (req, res, next) => {
  await PurchaseService.recordPayment(req.params.id, req.body, req.user);

  res.status(200).json({
    status: 'success',
    message: 'Payment recorded successfully',
  });
});

/* ======================================================
   6. DELETE PAYMENT
====================================================== */
exports.deletePayment = catchAsync(async (req, res, next) => {
  await PurchaseService.deletePayment(
    req.params.id,
    req.params.paymentId,
    req.user
  );

  res.status(200).json({
    status: 'success',
    message: 'Payment deleted successfully',
  });
});

/* ======================================================
   7. PARTIAL RETURN
====================================================== */
exports.partialReturn = catchAsync(async (req, res, next) => {
  const { items, reason } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError('A valid array of items is required', 400));
  }
  if (!reason?.trim()) {
    return next(new AppError('A return reason is required', 400));
  }

  await PurchaseService.partialReturn(req.params.id, { items, reason }, req.user);

  res.status(200).json({
    status: 'success',
    message: 'Partial return processed successfully',
  });
});

/* ======================================================
   8. GET PAYMENT HISTORY
====================================================== */
exports.getPaymentHistory = catchAsync(async (req, res, next) => {
  const payments = await Payment.find({
    purchaseId: req.params.id,
    organizationId: req.user.organizationId,
    isDeleted: { $ne: true },
  })
    .sort({ paymentDate: -1 })
    .select('paymentDate amount paymentMethod referenceNumber status remarks _id');

  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: { payments },
  });
});

/* ======================================================
   9. GET ANALYTICS
====================================================== */
exports.getPurchaseAnalytics = catchAsync(async (req, res, next) => {
  const data = await PurchaseService.getAnalytics(req.query, req.user);

  res.status(200).json({
    status: 'success',
    data,
  });
});

/* ======================================================
   10. GET PENDING PAYMENTS (AP dashboard)
====================================================== */
exports.getPendingPayments = catchAsync(async (req, res, next) => {
  const { days = 30 } = req.query;
  const pendingPayments = await PurchaseService.getPendingPayments(days, req.user);

  res.status(200).json({
    status: 'success',
    results: pendingPayments.length,
    data: { pendingPayments },
  });
});

/* ======================================================
   11. BULK UPDATE
====================================================== */
exports.bulkUpdatePurchases = catchAsync(async (req, res, next) => {
  const { ids, updates } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new AppError('IDs array is required', 400));
  }
  if (!updates || typeof updates !== 'object') {
    return next(new AppError('Updates object is required', 400));
  }

  const result = await PurchaseService.bulkUpdate(ids, updates, req.user);

  res.status(200).json({
    status: 'success',
    message: `Updated ${result.modifiedCount} purchase(s)`,
    data: result,
  });
});

/* ======================================================
   12. ADD ATTACHMENTS
====================================================== */
exports.addAttachments = catchAsync(async (req, res, next) => {
  if (!req.files?.length) {
    return next(new AppError('No files uploaded', 400));
  }

  const purchase = await Purchase.findOne({
    _id: req.params.id, organizationId: req.user.organizationId,
  });
  if (!purchase) return next(new AppError('Purchase not found', 404));

  const assets = await imageUploadService.uploadMultipleAndRecord(
    req.files, req.user, 'invoice'
  );
  const newFiles = assets.map(a => ({
    url: a.url, public_id: a.publicId,
    format: a.mimeType, bytes: a.size, assetId: a._id,
  }));

  purchase.attachedFiles.push(...newFiles);
  await purchase.save();

  res.status(200).json({
    status: 'success',
    message: `${newFiles.length} file(s) added successfully`,
    data: { purchase },
  });
});

/* ======================================================
   13. DELETE ATTACHMENT
====================================================== */
exports.deleteAttachment = catchAsync(async (req, res, next) => {
  const purchase = await Purchase.findOne({
    _id: req.params.id, organizationId: req.user.organizationId,
  });
  if (!purchase) return next(new AppError('Purchase not found', 404));

  const fileIndex = parseInt(req.params.fileIndex, 10);
  const fileObj = purchase.attachedFiles[fileIndex];
  if (!fileObj) return next(new AppError('File not found at index', 404));

  // Delete from Cloudinary + Asset DB
  if (fileObj.assetId) {
    try {
      await imageUploadService.deleteFullAsset(fileObj.assetId, req.user.organizationId);
    } catch (err) {
      console.warn(`[ATTACHMENT] Master asset deletion failed: ${err.message}`);
    }
  }

  purchase.attachedFiles.splice(fileIndex, 1);
  await purchase.save();

  res.status(200).json({
    status: 'success',
    message: 'Attachment removed successfully',
  });
});

/* ======================================================
   14. GET ALL RETURNS
====================================================== */
exports.getAllReturns = catchAsync(async (req, res, next) => {
  const { supplierId, startDate, endDate, purchaseId } = req.query;

  const filter = {
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
  };

  if (supplierId) filter.supplierId = supplierId;
  if (purchaseId) filter.purchaseId = purchaseId;
  if (startDate || endDate) {
    filter.returnDate = {};
    if (startDate) filter.returnDate.$gte = new Date(startDate);
    if (endDate) filter.returnDate.$lte = new Date(endDate);
  }

  const returns = await PurchaseReturn.find(filter)
    .sort({ returnDate: -1 })
    .populate('supplierId', 'companyName email phone')
    .populate('purchaseId', 'invoiceNumber grandTotal status')
    .populate('createdBy', 'name');

  res.status(200).json({
    status: 'success',
    results: returns.length,
    data: { returns },
  });
});

/* ======================================================
   15. GET RETURN BY ID
====================================================== */
exports.getReturnById = catchAsync(async (req, res, next) => {
  const record = await PurchaseReturn.findById(req.params.id)
    .populate({ path: 'purchaseId', select: 'invoiceNumber purchaseDate grandTotal' })
    .populate({ path: 'supplierId', select: 'companyName email phone address' })
    .populate({ path: 'createdBy', select: 'name email' })
    .populate({ path: 'items.productId', select: 'name sku' });

  if (!record) return next(new AppError('Return record not found', 404));

  res.status(200).json({
    status: 'success',
    data: { data: record },
  });
});

/* ======================================================
   16. DELETE PURCHASE (guard — use cancel instead)
====================================================== */
exports.deletePurchase = catchAsync(async (req, res, next) => {
  return next(new AppError('Deleting purchases is not allowed. Use cancel instead.', 403));
});

/* ======================================================
   17. READ-ONLY (factory-powered)
====================================================== */
exports.getAllPurchases = factory.getAll(Purchase, { populate: PURCHASE_POPULATE });
exports.getPurchase = factory.getOne(Purchase, { populate: PURCHASE_POPULATE });

// 'use strict';

// const PurchaseService = require('./service/purchase.service');
// const Purchase = require('./model/purchase.model');
// const factory = require('../../../core/utils/api/handlerFactory');
// const catchAsync = require('../../../core/utils/api/catchAsync');
// const AppError = require('../../../core/utils/api/appError');

// /* ======================================================
//    1. CREATE PURCHASE
// ====================================================== */
// exports.createPurchase = catchAsync(async (req, res, next) => {
//   const purchase = await PurchaseService.createPurchase(req.body, req.user);

//   res.status(201).json({
//     status: 'success',
//     data:   { purchase },
//   });
// });

// /* ======================================================
//    2. UPDATE PURCHASE
// ====================================================== */
// exports.updatePurchase = catchAsync(async (req, res, next) => {
//   const purchase = await PurchaseService.updatePurchase(
//     req.params.id, req.body, req.user
//   );

//   res.status(200).json({
//     status: 'success',
//     data:   { purchase },
//   });
// });

// /* ======================================================
//    3. DELETE PURCHASE
// ====================================================== */
// exports.deletePurchase = catchAsync(async (req, res, next) => {
//   await PurchaseService.deletePurchase(req.params.id, req.user);

//   res.status(200).json({
//     status:  'success',
//     message: 'Purchase deleted successfully',
//   });
// });

// /* ======================================================
//    4. READ-ONLY (factory-powered)
// ====================================================== */
// exports.getAllPurchases = factory.getAll(Purchase);
// exports.getPurchase     = factory.getOne(Purchase);
