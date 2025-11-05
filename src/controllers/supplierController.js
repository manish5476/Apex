// Simpler src/controllers/supplierController.js
const Supplier = require('../models/supplierModel');
const factory = require('../utils/handlerFactory');
const catchAsync = require('../utils/catchAsync');

// Use the factory for all standard CRUD
exports.createSupplier = factory.createOne(Supplier);
exports.getAllSuppliers = factory.getAll(Supplier);
exports.getSupplier = factory.getOne(Supplier);
exports.updateSupplier = factory.updateOne(Supplier);
exports.deleteSupplier = factory.deleteOne(Supplier);
exports.restoreSupplier = factory.restoreOne(Supplier); // Added restore

// Keep your excellent custom function for UI dropdowns
exports.getSupplierList = catchAsync(async (req, res, next) => {
  const suppliers = await Supplier.find({
    organizationId: req.user.organizationId,
    isDeleted: { $ne: true },
  }).select('companyName phone gstNumber'); // Use companyName

  res.status(200).json({
    status: 'success',
    results: suppliers.length,
    data: { suppliers },
  });
});

// const Supplier = require('../models/supplierModel');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');
// const factory = require('../utils/handlerFactory');

// /* -------------------------------------------------------------
//  * Create a new supplier
// ------------------------------------------------------------- */
// exports.createSupplier = catchAsync(async (req, res, next) => {
//   const { name, phone, email, gstNumber, address, branchId } = req.body;

//   if (!name || !phone) {
//     return next(new AppError('Supplier name and phone are required', 400));
//   }

//   // Auto-fill organization and createdBy
//   const supplier = await Supplier.create({
//     name,
//     phone,
//     email,
//     gstNumber,
//     address,
//     organizationId: req.user.organizationId,
//     branchId: branchId || req.user.branchId || null,
//     createdBy: req.user._id,
//   });

//   res.status(201).json({
//     status: 'success',
//     message: 'Supplier created successfully',
//     data: { supplier },
//   });
// });

// /* -------------------------------------------------------------
//  * Get all suppliers for logged-in user's organization
// ------------------------------------------------------------- */
// exports.getAllSuppliers = factory.getAll(Supplier);

// /* -------------------------------------------------------------
//  * Get single supplier
// ------------------------------------------------------------- */
// exports.getSupplier = factory.getOne(Supplier);

// /* -------------------------------------------------------------
//  * Update supplier
// ------------------------------------------------------------- */
// exports.updateSupplier = factory.updateOne(Supplier);

// /* -------------------------------------------------------------
//  * Delete supplier (soft delete supported)
// ------------------------------------------------------------- */
// exports.deleteSupplier = factory.deleteOne(Supplier);

// /* -------------------------------------------------------------
//  * Quick dropdown list (for invoice/purchase forms)
// ------------------------------------------------------------- */
// exports.getSupplierList = catchAsync(async (req, res, next) => {
//   const suppliers = await Supplier.find({
//     organizationId: req.user.organizationId,
//     isDeleted: { $ne: true },
//   }).select('name phone gstNumber');

//   res.status(200).json({
//     status: 'success',
//     results: suppliers.length,
//     data: { suppliers },
//   });
// });
