'use strict';

const ProductService = require('./service/product.service');
const StockService = require('./service/stock.service');
const Product = require('./model/product.model');
const imageUploadService = require('../../../modules/uploads/imageUploadService');
const factory = require('../../../core/utils/api/handlerFactory');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');

/* ======================================================
   1. CREATE PRODUCT
====================================================== */
exports.createProduct = catchAsync(async (req, res, next) => {
  const product = await ProductService.createProduct(req.body, req.user);

  res.status(201).json({
    status: 'success',
    data: { product },
  });
});

/* ======================================================
   2. UPDATE PRODUCT (metadata only)
====================================================== */
exports.updateProduct = catchAsync(async (req, res, next) => {
  const product = await ProductService.updateProduct(
    req.params.id, req.body, req.user
  );

  res.status(200).json({
    status: 'success',
    data: { product },
  });
});

/* ======================================================
   3. DELETE PRODUCT (soft-delete, stock must be 0)
====================================================== */
exports.deleteProduct = catchAsync(async (req, res, next) => {
  await ProductService.deleteProduct(req.params.id, req.user);

  res.status(200).json({
    status: 'success',
    message: 'Product deleted successfully',
  });
});

/* ======================================================
   4. STOCK ADJUSTMENT
====================================================== */
exports.adjustStock = catchAsync(async (req, res, next) => {
  const { type, quantity, reason, branchId } = req.body;

  if (!type || !quantity) {
    return next(new AppError('type and quantity are required', 400));
  }

  const product = await ProductService.adjustStock(
    req.params.id,
    { type, quantity, reason, branchId },
    req.user
  );

  res.status(200).json({
    status: 'success',
    data: { product },
  });
});

/* ======================================================
   5. STOCK TRANSFER (inter-branch)
====================================================== */
exports.transferStock = catchAsync(async (req, res, next) => {
  const { fromBranchId, toBranchId, quantity } = req.body;

  if (!fromBranchId || !toBranchId || !quantity) {
    return next(new AppError('fromBranchId, toBranchId and quantity are required', 400));
  }

  await ProductService.transferStock(
    req.params.id,
    { fromBranchId, toBranchId, quantity },
    req.user
  );

  res.status(200).json({
    status: 'success',
    message: 'Stock transferred successfully',
  });
});

/* ======================================================
   6. UPLOAD PRODUCT IMAGES
====================================================== */
exports.uploadProductImage = catchAsync(async (req, res, next) => {
  if (!req.files?.length) {
    return next(new AppError('Upload at least one image', 400));
  }

  // Pre-check existence before hitting Cloudinary
  const exists = await Product.exists({
    _id: req.params.id, organizationId: req.user.organizationId,
  });
  if (!exists) return next(new AppError('Product not found', 404));

  const uploadedAssets = await imageUploadService.uploadMultipleAndRecord(
    req.files, req.user, 'product'
  );

  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    {
      $push: {
        images: { $each: uploadedAssets.map(a => a.url) },
        imageAssets: { $each: uploadedAssets.map(a => a._id) },
      },
    },
    { new: true }
  );

  res.status(200).json({
    status: 'success',
    message: `${uploadedAssets.length} image(s) uploaded successfully`,
    data: { product, newAssets: uploadedAssets },
  });
});

/* ======================================================
   7. SEARCH PRODUCTS
====================================================== */
exports.searchProducts = catchAsync(async (req, res, next) => {
  const q = (req.query.q || '').trim();
  if (!q) return next(new AppError('Search query is required', 400));

  const products = await Product.find({
    organizationId: req.user.organizationId,
    isDeleted: { $ne: true },
    $or: [
      { name: new RegExp(q, 'i') },
      { sku: new RegExp(q, 'i') },
      { barcode: new RegExp(q, 'i') },
    ],
  })
    .select('name sku barcode sellingPrice inventory images isActive')
    .limit(20)
    .lean();

  res.status(200).json({
    status: 'success',
    results: products.length,
    data: { products },
  });
});

/* ======================================================
   8. SCAN PRODUCT (POS barcode / SKU lookup)
====================================================== */
// exports.scanProduct = catchAsync(async (req, res, next) => {
//   const { code, branchId } = req.body;

//   const result = await ProductService.scanProduct(code, branchId, req.user);

//   res.status(200).json({
//     status: 'success',
//     data: result,
//   });
// });

exports.scanProduct = catchAsync(async (req, res, next) => {
  // Grab BOTH possible keys from the request body
  const { barcode, code, branchId } = req.body;

  // Use whichever one was actually sent
  const scanValue = barcode || code;

  const result = await ProductService.scanProduct(scanValue, branchId, req.user);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});
/* ======================================================
   9. LOW STOCK REPORT
====================================================== */
exports.getLowStockProducts = catchAsync(async (req, res, next) => {
  const products = await ProductService.getLowStockProducts(req.user);

  res.status(200).json({
    status: 'success',
    results: products.length,
    data: { products },
  });
});

/* ======================================================
   10. PRODUCT HISTORY (movement ledger)
====================================================== */
exports.getProductHistory = catchAsync(async (req, res, next) => {
  const history = await ProductService.getProductHistory(
    req.params.id,
    req.user.organizationId,
    req.query
  );

  res.status(200).json({
    status: 'success',
    results: history.length,
    data: { history },
  });
});

/* ======================================================
   11. BULK IMPORT
====================================================== */
exports.bulkImportProducts = catchAsync(async (req, res, next) => {
  const result = await ProductService.bulkImport(req.body, req.user);

  res.status(201).json({
    status: 'success',
    message: `Imported ${result.importedCount} products successfully`,
    data: result,
  });
});

/* ======================================================
   12. BULK UPDATE
====================================================== */
exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
  const result = await ProductService.bulkUpdate(req.body, req.user);

  res.status(200).json({
    status: 'success',
    message: 'Bulk update completed',
    data: result,
  });
});

/* ======================================================
   13. GET STOCK VALUE (branch-level cost report)
====================================================== */
exports.getStockValue = catchAsync(async (req, res, next) => {
  const branchId = req.query.branchId || req.user.branchId;
  const value = await StockService.getStockValue(branchId, req.user.organizationId);

  res.status(200).json({
    status: 'success',
    data: { branchId, totalStockValue: value },
  });
});

/* ======================================================
   14. READ-ONLY (factory-powered)
====================================================== */
exports.getAllProducts = factory.getAll(Product, {
  populate: [
    { path: 'categoryId', select: 'name' },
    { path: 'departmentId', select: 'name' },
    { path: 'inventory.branchId', select: 'name' }
  ]
});
exports.getProduct = factory.getOne(Product, [{ path: 'inventory.branchId', select: 'name' }]);
exports.restoreProduct = factory.restoreOne(Product);