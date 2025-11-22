const Product = require('../models/productModel');
const factory = require('../utils/handlerFactory');
const catchAsync = require("../utils/catchAsync");

/**
 * @desc    Create a new product
 * @route   POST /api/v1/products
 * @note    Factory's 'createOne' auto-adds orgId, createdBy
 */
exports.createProduct = factory.createOne(Product);

/**
 * @desc    Get all products for the organization
 * @route   GET /api/v1/products
 * @note    Factory's 'getAll' auto-filters by orgId
 */
exports.getAllProducts = factory.getAll(Product);

/**
 * @desc    Get a single product by ID
 * @route   GET /api/v1/products/:id
 * @note    Factory's 'getOne' auto-checks orgId
 */
exports.getProduct = factory.getOne(Product, [
  { path: 'inventory.branchId', select: 'name' }, // Populate branch name in inventory
  { path: 'defaultSupplierId', select: 'companyName' } // Populate supplier name
]);

/**
 * @desc    Update a product
 * @route   PATCH /api/v1/products/:id
 * @note    Factory's 'updateOne' auto-checks orgId
 */
exports.updateProduct = factory.updateOne(Product);

/**
 * @desc    Delete a product (soft delete)
 * @route   DELETE /api/v1/products/:id
 * @note    Factory's 'deleteOne' auto-checks orgId and handles soft delete
 */
exports.deleteProduct = factory.deleteOne(Product);

/**
 * @desc    Restore a soft-deleted product
 * @route   PATCH /api/v1/products/:id/restore
 */
exports.restoreProduct = factory.restoreOne(Product);


const { uploadMultipleImages } = require("../services/uploads");
exports.uploadProductImages = catchAsync(async (req, res, next) => {
  if (!req.files || !req.files.length)
    return next(new AppError("Please upload product images", 400));
  const buffers = req.files.map((f) => f.buffer);
  const uploadResults = await uploadMultipleImages(buffers, "products");
  res.status(200).json({
    status: "success",
    data: { uploaded: uploadResults },
  });
});


// ======================================================
// SEARCH PRODUCTS
// GET /products/search?q=term
// ======================================================
exports.searchProducts = catchAsync(async (req, res, next) => {
  const q = req.query.q?.trim() || "";
  const orgId = req.user.organizationId;

  const products = await Product.find({
    organizationId: orgId,
    $or: [
      { name: { $regex: q, $options: "i" } },
      { sku: { $regex: q, $options: "i" } },
      { barcode: { $regex: q, $options: "i" } },
    ],
  }).limit(20);

  res.status(200).json({
    status: "success",
    results: products.length,
    data: { products },
  });
});

// ======================================================
// BULK IMPORT PRODUCTS
// POST /products/bulk-import
// ======================================================
exports.bulkImportProducts = catchAsync(async (req, res, next) => {
  const products = req.body;

  if (!Array.isArray(products) || products.length === 0)
    return next(new AppError("Provide an array of products.", 400));

  const orgId = req.user.organizationId;

  const mapped = products.map((p) => ({
    ...p,
    organizationId: orgId,
  }));

  await Product.insertMany(mapped);

  res.status(201).json({
    status: "success",
    message: "Bulk product import completed",
  });
});

// ======================================================
// PRODUCT IMAGE UPLOAD
// PATCH /products/:id/upload
// ======================================================
exports.uploadProductImage = catchAsync(async (req, res, next) => {
  if (!req.file || !req.file.buffer)
    return next(new AppError("Please upload an image file.", 400));

  const folder = `products/${req.user.organizationId}`;
  const imageUrl = await imageUploadService.uploadImage(
    req.file.buffer,
    folder
  );

  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { photo: imageUrl },
    { new: true }
  );

  if (!product) return next(new AppError("Product not found", 404));

  res.status(200).json({
    status: "success",
    message: "Product image uploaded successfully",
    data: { product },
  });
});