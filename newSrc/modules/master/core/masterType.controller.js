const MasterType = require("../models/masterTypeModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

// CREATE a new master type (Admin only)
exports.createMasterType = catchAsync(async (req, res, next) => {
  const { name, label } = req.body;

  if (!name || !label)
    return next(new AppError("Name and label are required", 400));

  const newType = await MasterType.create({
    name: name.toLowerCase().trim(),
    label: label.trim()
  });

  res.status(201).json({
    status: "success",
    data: { masterType: newType },
  });
});

// GET all master types
exports.getMasterTypes = catchAsync(async (req, res, next) => {
  const types = await MasterType.find({ isActive: true }).sort("name");

  res.status(200).json({
    status: "success",
    results: types.length,
    data: { masterTypes: types },
  });
});

// UPDATE master type (Admin only)
exports.updateMasterType = catchAsync(async (req, res, next) => {
  const updatedType = await MasterType.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!updatedType) return next(new AppError("Master type not found", 404));

  res.status(200).json({
    status: "success",
    data: { masterType: updatedType },
  });
});

// DELETE (soft delete) master type (Admin only)
exports.deleteMasterType = catchAsync(async (req, res, next) => {
  const deleted = await MasterType.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );

  if (!deleted) return next(new AppError("Master type not found", 404));

  res.status(200).json({
    status: "success",
    message: "Master type deleted successfully",
  });
});
