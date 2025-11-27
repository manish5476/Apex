const Supplier = require('../models/supplierModel');
const factory = require('../utils/handlerFactory');
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const mongoose = require('mongoose');
const imageUploadService = require("../services/uploads/imageUploadService");

// Standard CRUD
exports.createSupplier = factory.createOne(Supplier);
exports.getAllSuppliers = factory.getAll(Supplier);
exports.getSupplier = factory.getOne(Supplier);
exports.updateSupplier = factory.updateOne(Supplier);
exports.deleteSupplier = factory.deleteOne(Supplier);
exports.restoreSupplier = factory.restoreOne(Supplier);

// Dropdown list
exports.getSupplierList = catchAsync(async (req, res, next) => {
  const suppliers = await Supplier.find({
    organizationId: req.user.organizationId,
    isDeleted: { $ne: true },
  }).select('companyName phone gstNumber');

  res.status(200).json({
    status: 'success',
    results: suppliers.length,
    data: { suppliers },
  });
});

// Search
exports.searchSuppliers = catchAsync(async (req, res, next) => {
  const q = req.query.q || "";
  const org = req.user.organizationId;

  const suppliers = await Supplier.find({
    organizationId: org,
    isDeleted: false,
    $or: [
      { companyName: { $regex: q, $options: "i" } },
      { contactPerson: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
      { altPhone: { $regex: q, $options: "i" } },
      { gstNumber: { $regex: q, $options: "i" } },
      { panNumber: { $regex: q, $options: "i" } },
    ]
  }).limit(50);

  res.status(200).json({
    status: "success",
    results: suppliers.length,
    data: { suppliers },
  });
});

// // Upload Supplier Photo
// exports.uploadSupplierPhoto = catchAsync(async (req, res, next) => {
//   const supplierId = req.params.id;

//   // Validate ID
//   if (!mongoose.Types.ObjectId.isValid(supplierId)) {
//     return next(new AppError("Invalid supplier ID.", 400));
//   }

//   // Validate file
//   if (!req.file || !req.file.buffer) {
//     return next(new AppError("Please upload an image file.", 400));
//   }

//   // Upload to Cloud/S3
//   const folder = `suppliers/${req.user.organizationId}`;
//   const uploadResult = await imageUploadService.uploadImage(
//     req.file.buffer,
//     folder
//   );

//   // Update record
//   const supplier = await Supplier.findOneAndUpdate(
//     { _id: supplierId, organizationId: req.user.organizationId, isDeleted: false },
//     { avatar: uploadResult.url },
//     { new: true }
//   );

//   if (!supplier) {
//     return next(new AppError("Supplier not found or belongs to another organization.", 404));
//   }

//   res.status(200).json({
//     status: "success",
//     message: "Supplier photo updated successfully",
//     data: { supplier },
//   });
// });


// // Simpler src/controllers/supplierController.js
// const Supplier = require('../models/supplierModel');
// const factory = require('../utils/handlerFactory');
// const catchAsync = require('../utils/catchAsync');
// // Use the factory for all standard CRUD
// exports.createSupplier = factory.createOne(Supplier);
// exports.getAllSuppliers = factory.getAll(Supplier);
// exports.getSupplier = factory.getOne(Supplier);
// exports.updateSupplier = factory.updateOne(Supplier);
// exports.deleteSupplier = factory.deleteOne(Supplier);
// exports.restoreSupplier = factory.restoreOne(Supplier);
// const mongoose = require("mongoose");

// // Keep your excellent custom function for UI dropdowns
// exports.getSupplierList = catchAsync(async (req, res, next) => {
//   const suppliers = await Supplier.find({
//     organizationId: req.user.organizationId,
//     isDeleted: { $ne: true },
//   }).select('companyName phone gstNumber'); // Use companyName
//   res.status(200).json({
//     status: 'success',
//     results: suppliers.length,
//     data: { suppliers },
//   });
// });

// // GET /v1/suppliers/search?q=
// // exports.searchSuppliers = catchAsync(async (req, res, next) => {
// //   const q = req.query.q || "";
// //   const org = req.user.organizationId;
// //   const suppliers = await Supplier.find({
// //     organizationId: org,
// //     $or: [
// //       { name: { $regex: q, $options: "i" } },
// //       { phone: { $regex: q, $options: "i" } },
// //       { gstNumber: { $regex: q, $options: "i" } },
// //     ]
// //   }).limit(50);
// //   res.status(200).json({ status: 'success', results: suppliers.length, data: { suppliers } });
// // });
// exports.searchSuppliers = catchAsync(async (req, res, next) => {
//   const q = req.query.q || "";
//   const org = req.user.organizationId;

//   const suppliers = await Supplier.find({
//     organizationId: org,
//     isDeleted: false,
//     $or: [
//       { companyName: { $regex: q, $options: "i" } },
//       { contactPerson: { $regex: q, $options: "i" } },
//       { phone: { $regex: q, $options: "i" } },
//       { altPhone: { $regex: q, $options: "i" } },
//       { gstNumber: { $regex: q, $options: "i" } },
//       { panNumber: { $regex: q, $options: "i" } },
//     ],
//   }).limit(50);

//   res.status(200).json({
//     status: "success",
//     results: suppliers.length,
//     data: { suppliers },
//   });
// });


// exports.uploadSupplierPhoto = catchAsync(async (req, res, next) => {
//   const supplierId = req.params.id;

//   // 1️⃣ Validate MongoDB ID early
//   if (!mongoose.Types.ObjectId.isValid(supplierId)) {
//     return next(new AppError("Invalid supplier ID.", 400));
//   }

//   // 2️⃣ Validate file presence
//   if (!req.file || !req.file.buffer) {
//     return next(new AppError("Please upload an image file.", 400));
//   }

//   // 3️⃣ Upload image to your storage (Cloudinary / S3 / etc.)
//   const folder = `suppliers/${req.user.organizationId}`;
//   const uploadResult = await imageUploadService.uploadImage(
//     req.file.buffer,
//     folder
//   );

//   // 4️⃣ Update supplier record
//   const supplier = await Supplier.findOneAndUpdate(
//     { _id: supplierId, organizationId: req.user.organizationId, isDeleted: false },
//     { avatar: uploadResult.url },
//     { new: true }
//   );

//   if (!supplier) {
//     return next(new AppError("Supplier not found or belongs to another organization.", 404));
//   }

//   // 5️⃣ Return response
//   res.status(200).json({
//     status: "success",
//     message: "Supplier photo updated successfully",
//     data: { supplier },
//   });
// });



// // const Supplier = require('../models/supplierModel');
// // const catchAsync = require('../utils/catchAsync');
// // const AppError = require('../utils/appError');
// // const factory = require('../utils/handlerFactory');

// // /* -------------------------------------------------------------
// //  * Create a new supplier
// // ------------------------------------------------------------- */
// // exports.createSupplier = catchAsync(async (req, res, next) => {
// //   const { name, phone, email, gstNumber, address, branchId } = req.body;

// //   if (!name || !phone) {
// //     return next(new AppError('Supplier name and phone are required', 400));
// //   }

// //   // Auto-fill organization and createdBy
// //   const supplier = await Supplier.create({
// //     name,
// //     phone,
// //     email,
// //     gstNumber,
// //     address,
// //     organizationId: req.user.organizationId,
// //     branchId: branchId || req.user.branchId || null,
// //     createdBy: req.user._id,
// //   });

// //   res.status(201).json({
// //     status: 'success',
// //     message: 'Supplier created successfully',
// //     data: { supplier },
// //   });
// // });

// // /* -------------------------------------------------------------
// //  * Get all suppliers for logged-in user's organization
// // ------------------------------------------------------------- */
// // exports.getAllSuppliers = factory.getAll(Supplier);

// // /* -------------------------------------------------------------
// //  * Get single supplier
// // ------------------------------------------------------------- */
// // exports.getSupplier = factory.getOne(Supplier);

// // /* -------------------------------------------------------------
// //  * Update supplier
// // ------------------------------------------------------------- */
// // exports.updateSupplier = factory.updateOne(Supplier);

// // /* -------------------------------------------------------------
// //  * Delete supplier (soft delete supported)
// // ------------------------------------------------------------- */
// // exports.deleteSupplier = factory.deleteOne(Supplier);

// // /* -------------------------------------------------------------
// //  * Quick dropdown list (for invoice/purchase forms)
// // ------------------------------------------------------------- */
// // exports.getSupplierList = catchAsync(async (req, res, next) => {
// //   const suppliers = await Supplier.find({
// //     organizationId: req.user.organizationId,
// //     isDeleted: { $ne: true },
// //   }).select('name phone gstNumber');

// //   res.status(200).json({
// //     status: 'success',
// //     results: suppliers.length,
// //     data: { suppliers },
// //   });
// // });
