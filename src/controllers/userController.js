const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const imageUploadService = require("../services/uploads/imageUploadService");

// ======================================================
// GET /users/me
// ======================================================
exports.getMyProfile = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) return next(new AppError("User not found.", 404));

  res.status(200).json({ status: "success", data: { user } });
});

// ======================================================
// PATCH /users/me/photo
// ======================================================
exports.uploadProfilePhoto = catchAsync(async (req, res, next) => {
  if (!req.file || !req.file.buffer)
    return next(new AppError("Please upload an image file.", 400));

  const folder = `profiles/${req.user.organizationId || "global"}`;
  const imageUrl = await imageUploadService.uploadImage(req.file.buffer, folder);

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { avatar: imageUrl },
    { new: true, runValidators: true, select: "-password" }
  );

  res.status(200).json({
    status: "success",
    message: "Profile photo updated successfully.",
    data: { user: updatedUser },
  });
});

// ======================================================
// PATCH /users/me   (Update profile fields)
// ======================================================
exports.updateMyProfile = catchAsync(async (req, res, next) => {
  // Block password change
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError("This route is not for password updates.", 400)
    );
  }

  const allowedFields = ["name", "phone", "avatar", "branchId"];
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true,
  }).select("-password");

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

// ======================================================
// PATCH /users/update-password (Admin resets someone's password)
// ======================================================
exports.adminUpdatePassword = catchAsync(async (req, res, next) => {
  const { password, passwordConfirm } = req.body;

  if (!password || !passwordConfirm)
    return next(new AppError("Provide password & passwordConfirm", 400));

  if (password !== passwordConfirm)
    return next(new AppError("Passwords do not match", 400));

  const user = await User.findById(req.params.id).select("+password");
  if (!user) return next(new AppError("User not found", 404));

  user.password = password;
  user.passwordConfirm = passwordConfirm;
  await user.save();

  res.status(200).json({
    status: "success",
    message: "Password updated successfully",
  });
});

// ======================================================
// GET /users (Admin only)
// ======================================================
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const users = await User.find({
    organizationId: req.user.organizationId,
  })
    .populate("role")
    .populate("branchId")
    .select("-password");

  res.status(200).json({
    status: "success",
    results: users.length,
    data: { users },
  });
});

// ======================================================
// POST /users (Admin create user)
// ======================================================
exports.createUser = catchAsync(async (req, res, next) => {
  const {
    name,
    email,
    password,
    passwordConfirm,
    role,
    branchId,
    phone,
  } = req.body;

  if (!name || !email || !password || !passwordConfirm)
    return next(new AppError("Missing required fields", 400));

  if (password !== passwordConfirm)
    return next(new AppError("Passwords do not match", 400));

  const newUser = await User.create({
    name,
    email,
    password,
    passwordConfirm,
    role,
    branchId,
    phone,
    organizationId: req.user.organizationId,
    status: "approved",
  });

  res.status(201).json({
    status: "success",
    data: { user: newUser },
  });
});

// ======================================================
// PATCH /users/:id (Admin update user)
// ======================================================
exports.updateUser = catchAsync(async (req, res, next) => {
  const allowedFields = [
    "name",
    "phone",
    "role",
    "branchId",
    "status",
    "avatar",
  ];
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const updatedUser = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!updatedUser) return next(new AppError("User not found", 404));

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

// ======================================================
// DELETE /users/:id (Soft Delete)
// ======================================================
exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: "inactive", isActive: false },
    { new: true }
  );

  if (!user) return next(new AppError("User not found", 404));

  res.status(204).json({ status: "success", data: null });
});


// const User = require("../models/userModel");
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const bcrypt = require("bcryptjs");

// // ======================================================
// // 🧩 FILTER ALLOWED FIELDS
// // ======================================================
// const filterObject = (obj, ...allowedFields) => {
//   const newObj = {};
//   Object.keys(obj).forEach((key) => {
//     if (allowedFields.includes(key)) newObj[key] = obj[key];
//   });
//   return newObj;
// };

// // ======================================================
// // 🧩 GET MY PROFILE
// // ======================================================
// exports.getMe = catchAsync(async (req, res) => {
//   return res.status(200).json({
//     status: "success",
//     data: {
//       user: req.user,
//     },
//   });
// });

// // ======================================================
// // 🧩 UPDATE PROFILE (SELF)
// // ======================================================
// exports.updateMe = catchAsync(async (req, res, next) => {
//   // Prevent sensitive updates
//   if (req.body.password || req.body.passwordConfirm)
//     return next(new AppError("This route is not for password updates.", 400));

//   const allowedFields = [
//     "name",
//     "phone",
//     "avatar",
//     "email",
//     "branchId",
//   ];

//   const filteredBody = filterObject(req.body, ...allowedFields);

//   const updatedUser = await User.findByIdAndUpdate(
//     req.user.id,
//     filteredBody,
//     { new: true, runValidators: true }
//   ).populate("role");

//   res.status(200).json({
//     status: "success",
//     data: { user: updatedUser },
//   });
// });

// // ======================================================
// // 🧩 UPDATE USER PASSWORD (ADMIN PANEL)
// // ======================================================
// exports.updateUserPassword = catchAsync(async (req, res, next) => {
//   const { newPassword, newPasswordConfirm } = req.body;

//   if (!newPassword || !newPasswordConfirm)
//     return next(new AppError("Provide newPassword & newPasswordConfirm", 400));

//   if (newPassword !== newPasswordConfirm)
//     return next(new AppError("Passwords do not match", 400));

//   const user = await User.findById(req.params.id).select("+password");
//   if (!user) return next(new AppError("User not found", 404));

//   user.password = newPassword;
//   user.passwordConfirm = newPasswordConfirm;
//   await user.save();

//   res.status(200).json({
//     status: "success",
//     message: "Password updated successfully.",
//   });
// });

// // ======================================================
// // 🧩 GET ALL USERS (ADMIN)
// // ======================================================
// exports.getAllUsers = catchAsync(async (req, res) => {
//   const users = await User.find({ organizationId: req.user.organizationId })
//     .populate("role")
//     .select("-password");

//   res.status(200).json({
//     status: "success",
//     results: users.length,
//     data: { users },
//   });
// });

// // ======================================================
// // 🧩 CREATE USER (ADMIN)
// // ======================================================
// exports.createUser = catchAsync(async (req, res, next) => {
//   const {
//     name,
//     email,
//     password,
//     passwordConfirm,
//     role,
//     phone,
//     branchId,
//   } = req.body;

//   if (!name || !email || !password || !passwordConfirm)
//     return next(new AppError("Missing required fields", 400));

//   if (password !== passwordConfirm)
//     return next(new AppError("Passwords do not match", 400));

//   const existing = await User.findOne({ email });
//   if (existing)
//     return next(new AppError("Email already exists", 400));

//   const user = await User.create({
//     name,
//     email,
//     password,
//     passwordConfirm,
//     role,
//     phone,
//     branchId,
//     organizationId: req.user.organizationId,
//     status: "approved",
//   });

//   res.status(201).json({
//     status: "success",
//     data: { user },
//   });
// });

// // ======================================================
// // 🧩 UPDATE ANY USER (ADMIN)
// // ======================================================
// exports.updateUser = catchAsync(async (req, res, next) => {
//   const allowedFields = ["name", "email", "phone", "role", "branchId", "status", "avatar"];

//   const filtered = filterObject(req.body, ...allowedFields);

//   const user = await User.findByIdAndUpdate(req.params.id, filtered, {
//     new: true,
//     runValidators: true,
//   }).populate("role");

//   if (!user) return next(new AppError("User not found", 404));

//   res.status(200).json({
//     status: "success",
//     data: { user },
//   });
// });

// // ======================================================
// // 🧩 DELETE USER (ADMIN)
// // ======================================================
// exports.deleteUser = catchAsync(async (req, res, next) => {
//   const user = await User.findByIdAndDelete(req.params.id);
//   if (!user) return next(new AppError("User not found", 404));

//   res.status(204).json({ status: "success", data: null });
// });


// // const User = require("../models/userModel");
// // const catchAsync = require("../utils/catchAsync");
// // const AppError = require("../utils/appError");
// // const bcrypt = require("bcryptjs");

// // // ======================================================
// // // 🧩 FILTER ALLOWED FIELDS
// // // ======================================================
// // const filterObject = (obj, ...allowedFields) => {
// //   const newObj = {};
// //   Object.keys(obj).forEach((key) => {
// //     if (allowedFields.includes(key)) newObj[key] = obj[key];
// //   });
// //   return newObj;
// // };

// // // ======================================================
// // // 🧩 GET MY PROFILE
// // // ======================================================
// // exports.getMe = catchAsync(async (req, res) => {
// //   return res.status(200).json({
// //     status: "success",
// //     data: {
// //       user: req.user,
// //     },
// //   });
// // });

// // // ======================================================
// // // 🧩 UPDATE PROFILE (SELF)
// // // ======================================================
// // exports.updateMe = catchAsync(async (req, res, next) => {
// //   // Prevent sensitive updates
// //   if (req.body.password || req.body.passwordConfirm)
// //     return next(new AppError("This route is not for password updates.", 400));

// //   const allowedFields = [
// //     "name",
// //     "phone",
// //     "avatar",
// //     "email",
// //     "branchId",
// //   ];

// //   const filteredBody = filterObject(req.body, ...allowedFields);

// //   const updatedUser = await User.findByIdAndUpdate(
// //     req.user.id,
// //     filteredBody,
// //     { new: true, runValidators: true }
// //   ).populate("role");

// //   res.status(200).json({
// //     status: "success",
// //     data: { user: updatedUser },
// //   });
// // });

// // // ======================================================
// // // 🧩 UPDATE USER PASSWORD (ADMIN PANEL)
// // // ======================================================
// // exports.updateUserPassword = catchAsync(async (req, res, next) => {
// //   const { newPassword, newPasswordConfirm } = req.body;

// //   if (!newPassword || !newPasswordConfirm)
// //     return next(new AppError("Provide newPassword & newPasswordConfirm", 400));

// //   if (newPassword !== newPasswordConfirm)
// //     return next(new AppError("Passwords do not match", 400));

// //   const user = await User.findById(req.params.id).select("+password");
// //   if (!user) return next(new AppError("User not found", 404));

// //   user.password = newPassword;
// //   user.passwordConfirm = newPasswordConfirm;
// //   await user.save();

// //   res.status(200).json({
// //     status: "success",
// //     message: "Password updated successfully.",
// //   });
// // });

// // // ======================================================
// // // 🧩 GET ALL USERS (ADMIN)
// // // ======================================================
// // exports.getAllUsers = catchAsync(async (req, res) => {
// //   const users = await User.find({ organizationId: req.user.organizationId })
// //     .populate("role")
// //     .select("-password");

// //   res.status(200).json({
// //     status: "success",
// //     results: users.length,
// //     data: { users },
// //   });
// // });

// // // ======================================================
// // // 🧩 CREATE USER (ADMIN)
// // // ======================================================
// // exports.createUser = catchAsync(async (req, res, next) => {
// //   const {
// //     name,
// //     email,
// //     password,
// //     passwordConfirm,
// //     role,
// //     phone,
// //     branchId,
// //   } = req.body;

// //   if (!name || !email || !password || !passwordConfirm)
// //     return next(new AppError("Missing required fields", 400));

// //   if (password !== passwordConfirm)
// //     return next(new AppError("Passwords do not match", 400));

// //   const existing = await User.findOne({ email });
// //   if (existing)
// //     return next(new AppError("Email already exists", 400));

// //   const user = await User.create({
// //     name,
// //     email,
// //     password,
// //     passwordConfirm,
// //     role,
// //     phone,
// //     branchId,
// //     organizationId: req.user.organizationId,
// //     status: "approved",
// //   });

// //   res.status(201).json({
// //     status: "success",
// //     data: { user },
// //   });
// // });

// // // ======================================================
// // // 🧩 UPDATE ANY USER (ADMIN)
// // // ======================================================
// // exports.updateUser = catchAsync(async (req, res, next) => {
// //   const allowedFields = ["name", "email", "phone", "role", "branchId", "status", "avatar"];

// //   const filtered = filterObject(req.body, ...allowedFields);

// //   const user = await User.findByIdAndUpdate(req.params.id, filtered, {
// //     new: true,
// //     runValidators: true,
// //   }).populate("role");

// //   if (!user) return next(new AppError("User not found", 404));

// //   res.status(200).json({
// //     status: "success",
// //     data: { user },
// //   });
// // });

// // // ======================================================
// // // 🧩 DELETE USER (ADMIN)
// // // ======================================================
// // exports.deleteUser = catchAsync(async (req, res, next) => {
// //   const user = await User.findByIdAndDelete(req.params.id);
// //   if (!user) return next(new AppError("User not found", 404));

// //   res.status(204).json({ status: "success", data: null });
// // });

// // // // src/controllers/userController.js
// // // const User = require("../models/userModel");
// // // const catchAsync = require("../utils/catchAsync");
// // // const AppError = require("../utils/appError");
// // // const imageUploadService = require("../services/uploads/imageUploadService");


// // // exports.getMyProfile = catchAsync(async (req, res, next) => {
// // //   const user = await User.findById(req.user.id).select("-password");
// // //   if (!user) return next(new AppError("User not found.", 404));
// // //   res.status(200).json({ status: "success", data: { user } });
// // // });

// // // exports.uploadProfilePhoto = catchAsync(async (req, res, next) => {
// // //   if (!req.file || !req.file.buffer) {
// // //     return next(new AppError("Please upload an image file.", 400));
// // //   }
// // //   const imageUrl = await imageUploadService.uploadImage(
// // //     req.file.buffer,
// // //     `profiles/${req.user.organizationId || "global"}`,
// // //   );

// // //   const updatedUser = await User.findByIdAndUpdate(
// // //     req.user.id,
// // //     { avatar: imageUrl },
// // //     { new: true, runValidators: true, select: "-password" },
// // //   );

// // //   res.status(200).json({
// // //     status: "success",
// // //     message: "Profile photo updated successfully.",
// // //     data: { user: updatedUser },
// // //   });
// // // });
