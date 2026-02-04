const Supplier = require('./supplier.model');
const factory = require('../../../core/utils/handlerFactory');
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const mongoose = require('mongoose');
const imageUploadService = require("../../_legacy/services/uploads/imageUploadService");

// Standard CRUD
exports.createSupplier = factory.createOne(Supplier);
exports.createbulkSupplier = factory.bulkCreate(Supplier);
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
