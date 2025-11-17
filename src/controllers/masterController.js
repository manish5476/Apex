const Master = require("../models/masterModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

/**
 * @desc Create new master item (category, brand, etc.)
 */
exports.createMaster = catchAsync(async (req, res, next) => {
  const { type, name, code, description } = req.body;
  if (!type || !name) return next(new AppError("Type and name are required", 400));

  const newMaster = await Master.create({
    organizationId: req.user.organizationId,
    type: type.toLowerCase(),
    name: name.trim(),
    code,
    description,
    createdBy: req.user._id,
  });

  res.status(201).json({
    status: "success",
    data: { master: newMaster },
  });
});

/**
 * @desc Get all masters (optionally by type)
 */
exports.getMasters = catchAsync(async (req, res, next) => {
  const filter = { organizationId: req.user.organizationId };
  if (req.query.type) filter.type = req.query.type.toLowerCase();

  const masters = await Master.find(filter).sort("type name");

  res.status(200).json({
    status: "success",
    results: masters.length,
    data: { masters },
  });
});

/**
 * @desc Update a master item
 */
exports.updateMaster = catchAsync(async (req, res, next) => {
  const updated = await Master.findOneAndUpdate(
    {
      _id: req.params.id,
      organizationId: req.user.organizationId,
    },
    req.body,
    { new: true, runValidators: true }
  );

  if (!updated) return next(new AppError("Master not found or not yours", 404));

  res.status(200).json({
    status: "success",
    data: { master: updated },
  });
});

/**
 * @desc Delete (soft-delete) a master item
 */
exports.deleteMaster = catchAsync(async (req, res, next) => {
  const master = await Master.findOneAndUpdate(
    {
      _id: req.params.id,
      organizationId: req.user.organizationId,
    },
    { isActive: false },
    { new: true }
  );

  if (!master) return next(new AppError("Master not found", 404));

  res.status(200).json({
    status: "success",
    message: "Master deactivated successfully",
  });
});
