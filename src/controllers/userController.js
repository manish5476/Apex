// src/controllers/userController.js
const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const imageUploadService = require("../services/uploads/imageUploadService");


exports.getMyProfile = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) return next(new AppError("User not found.", 404));
  res.status(200).json({ status: "success", data: { user } });
});

exports.uploadProfilePhoto = catchAsync(async (req, res, next) => {
  if (!req.file || !req.file.buffer) {
    return next(new AppError("Please upload an image file.", 400));
  }
  const imageUrl = await imageUploadService.uploadImage(
    req.file.buffer,
    `profiles/${req.user.organizationId || "global"}`,
  );

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { avatar: imageUrl },
    { new: true, runValidators: true, select: "-password" },
  );

  res.status(200).json({
    status: "success",
    message: "Profile photo updated successfully.",
    data: { user: updatedUser },
  });
});
