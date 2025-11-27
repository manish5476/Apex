const Product = require('../models/productModel');
const factory = require('../utils/handlerFactory');
const catchAsync = require("../utils/catchAsync");
const imageUploadService = require("../services/uploads/imageUploadService");

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
  // 1. Check for 'req.files' (Plural)
  if (!req.files || req.files.length === 0) {
    return next(new AppError("Please upload at least one image.", 400));
  }

  const folder = `products/${req.user.organizationId}`;

  // 2. Upload ALL files in parallel
  const uploadPromises = req.files.map(file => 
    imageUploadService.uploadImage(file.buffer, folder)
  );

  const uploadResults = await Promise.all(uploadPromises);

  // 3. Extract URLs
  const imageUrls = uploadResults.map(result => result.url);

  // 4. Push ALL new URLs to the images array
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { 
      $push: { 
        images: { 
          $each: imageUrls, 
          $position: 0 // Add to the top of the list
        } 
      } 
    },
    { new: true }
  );

  if (!product) return next(new AppError("Product not found", 404));

  res.status(200).json({
    status: "success",
    message: `${imageUrls.length} image(s) uploaded successfully`,
    data: { product },
  });
});



// POST /v1/products/bulk-update
exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
  const updates = req.body; // expect [{ _id, update: { field: value } }, ...]
  if (!Array.isArray(updates) || updates.length === 0) return next(new AppError("Provide updates array", 400));
  const org = req.user.organizationId;

  const ops = updates.map(u => ({
    updateOne: {
      filter: { _id: u._id, organizationId: org },
      update: u.update
    }
  }));

  await Product.bulkWrite(ops);
  res.status(200).json({ status: "success", message: "Bulk update applied." });
});

// POST /v1/products/:id/stock-adjust
exports.adjustStock = catchAsync(async (req, res, next) => {
  const { type, quantity, reason } = req.body;
  if (!['add','subtract'].includes(type)) return next(new AppError("Invalid type", 400));
  if (typeof quantity !== 'number' || quantity <= 0) return next(new AppError("Invalid quantity", 400));

  const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!product) return next(new AppError("Product not found", 404));

  product.stock = type === 'add' ? product.stock + quantity : product.stock - quantity;
  if (product.stock < 0) product.stock = 0;
  await product.save();

  // Optionally create StockAdjustment log model
  res.status(200).json({ status: "success", data: { product } });
});


// exports.uploadProductImage = catchAsync(async (req, res, next) => {
//   if (!req.file || !req.file.buffer) {
//     return next(new AppError("Please upload an image file.", 400));
//   }

//   const folder = `products/${req.user.organizationId}`;
  
//   // 1. Upload to Cloudinary/S3
//   const uploadResult = await imageUploadService.uploadImage(req.file.buffer, folder);

//   // 2. Update Database
//   // We use $push with $position: 0 to add the new image to the FRONT of the array
//   const product = await Product.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     { 
//       $push: { 
//         images: { 
//           $each: [uploadResult.url], // Extract .url
//           $position: 0               // Prepend (Make it the main image)
//         } 
//       } 
//     },
//     { new: true }
//   );

//   if (!product) return next(new AppError("Product not found", 404));

//   res.status(200).json({
//     status: "success",
//     message: "Product image uploaded successfully",
//     data: { product },
//   });
// });

// exports.uploadProductImage = catchAsync(async (req, res, next) => {
//   if (!req.file || !req.file.buffer)
//     return next(new AppError("Please upload an image file.", 400));
//   const folder = `products/${req.user.organizationId}`;
//   const imageUrl = await imageUploadService.uploadImage(
//     req.file.buffer,
//     folder
//   );
//   const product = await Product.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     { photo: imageUrl },
//     { new: true }
//   );
//   if (!product) return next(new AppError("Product not found", 404));
//   res.status(200).json({
//     status: "success",
//     message: "Product image uploaded successfully",
//     data: { product },
//   });
// });