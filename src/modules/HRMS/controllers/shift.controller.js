'use strict';

const Shift = require("../models/shift.model");
const User = require("../../auth/core/user.model"); // Adjust path to User model
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const factory = require("../../../core/utils/handlerFactory");

// ======================================================
//  SHIFT MANAGEMENT
// ======================================================

exports.createShift = catchAsync(async (req, res, next) => {
  req.body.organizationId = req.user.organizationId;

  // Basic Logic Validation
  if (req.body.startTime >= req.body.endTime && !req.body.isNightShift) {
    return next(new AppError("Start time must be before End time (unless night shift).", 400));
  }

  const shift = await Shift.create(req.body);

  res.status(201).json({
    status: "success",
    data: { shift },
  });
});

exports.updateShift = catchAsync(async (req, res, next) => {
  const shift = await Shift.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  
  if (!shift) return next(new AppError("Shift not found", 404));

  // Prevent changing organizationId
  delete req.body.organizationId;

  const updatedShift = await Shift.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: "success",
    data: { shift: updatedShift },
  });
});

exports.deleteShift = catchAsync(async (req, res, next) => {
  const shift = await Shift.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!shift) return next(new AppError("Shift not found", 404));

  // 🔴 SAFETY CHECK: Don't delete if users are assigned
  const assignedUsers = await User.countDocuments({ 
    'attendanceConfig.shiftId': shift._id, 
    isActive: true 
  });

  if (assignedUsers > 0) {
    return next(new AppError(`Cannot delete this shift. It is currently assigned to ${assignedUsers} active employees. Please reassign them first.`, 400));
  }

  // Soft Delete (Preferred) or Hard Delete
  // await Shift.findByIdAndDelete(req.params.id);
  shift.isActive = false;
  await shift.save();

  res.status(204).json({ status: "success", data: null });
});

exports.getAllShifts = catchAsync(async (req, res, next) => {
  // Force Org Context
  req.query.organizationId = req.user.organizationId;
  
  return factory.getAll(Shift)(req, res, next);
});

exports.getShift = factory.getOne(Shift);