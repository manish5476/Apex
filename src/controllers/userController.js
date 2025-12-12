const User = require("../models/userModel");
const ActivityLog = require("../models/activityLogModel"); // ✅ Fixed: Was missing
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const imageUploadService = require("../services/uploads/imageUploadService");

// ======================================================
// GET /users/me (Logged In User Profile)
// ======================================================
exports.getMyProfile = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate("role", "name permissions") // ✅ Only fetch name & permissions
    .populate("branchId", "name address phone") // ✅ Only fetch non-sensitive branch info
    .select("-password");

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
    { avatar: imageUrl.url || imageUrl }, 
    { new: true, runValidators: true }
  ).select("-password");

  res.status(200).json({
    status: "success",
    message: "Profile photo updated successfully.",
    data: { user: updatedUser },
  });
});

// ======================================================
// PATCH /users/me (Update profile fields)
// ======================================================
exports.updateMyProfile = catchAsync(async (req, res, next) => {
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError("This route is not for password updates.", 400));
  }

  const allowedFields = ["name", "phone", "avatar"]; // Removed branchId (User shouldn't change their own branch usually)
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true,
  })
  .populate("role", "name")
  .populate("branchId", "name")
  .select("-password");

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

// ======================================================
// ADMIN: GET SINGLE USER (New! Required for "View/Edit" Page)
// GET /users/:id
// ======================================================
exports.getUser = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
    .populate("role", "name permissions isSuperAdmin") // ✅ Useful for Admin UI
    .populate("branchId", "name address city")         // ✅ Useful for Admin UI
    .select("-password");

  if (!user) return next(new AppError("User not found", 404));

  res.status(200).json({
    status: "success",
    data: { user },
  });
});

// ======================================================
// ADMIN: GET ALL USERS
// ======================================================
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const users = await User.find({ organizationId: req.user.organizationId })
    .populate("role", "name")          // ✅ Just the name is usually enough for the list
    .populate("branchId", "name")      // ✅ Just the name
    .select("-password")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: users.length,
    data: { users },
  });
});

// ======================================================
// ADMIN: CREATE USER
// ======================================================
exports.createUser = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, role, branchId, phone } = req.body;

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

  // Remove password from response
  newUser.password = undefined;

  res.status(201).json({
    status: "success",
    data: { user: newUser },
  });
});

// ======================================================
// ADMIN: UPDATE USER
// ======================================================
exports.updateUser = catchAsync(async (req, res, next) => {
  const allowedFields = ["name", "phone", "role", "branchId", "status", "avatar", "isActive"];
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const updatedUser = await User.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    updates,
    { new: true, runValidators: true }
  )
    .populate("role") // ✅ Populate Role to get permissions
  // .populate("role", "name")
  .populate("branchId", "name")
  .select("-password");

  if (!updatedUser) return next(new AppError("User not found", 404));

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

// ======================================================
// ADMIN: RESET PASSWORD
// ======================================================
exports.adminUpdatePassword = catchAsync(async (req, res, next) => {
  const { password, passwordConfirm } = req.body;

  if (!password || !passwordConfirm) return next(new AppError("Provide password & passwordConfirm", 400));
  if (password !== passwordConfirm) return next(new AppError("Passwords do not match", 400));

  // Use findOne to ensure Org scope
  const user = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).select("+password");
  if (!user) return next(new AppError("User not found", 404));

  user.password = password;
  user.passwordConfirm = passwordConfirm;
  await user.save();

  res.status(200).json({ status: "success", message: "Password updated successfully" });
});

// ======================================================
// ADMIN: SEARCH USERS
// ======================================================
exports.searchUsers = catchAsync(async (req, res, next) => {
  const q = req.query.q || "";
  const org = req.user.organizationId;
  const users = await User.find({
    organizationId: org,
    $or: [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } }
    ]
  })
  .limit(50)
  .populate("role", "name")
  .populate("branchId", "name")
  .select("-password");

  res.status(200).json({ status: "success", results: users.length, data: { users } });
});

// ======================================================
// ADMIN: ACTIVATE / DEACTIVATE
// ======================================================
exports.deactivateUser = catchAsync(async (req, res, next) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { status: "inactive", isActive: false },
    { new: true }
  ).select("-password");
  if (!user) return next(new AppError("User not found", 404));
  res.status(200).json({ status: "success", data: { user } });
});

exports.activateUser = catchAsync(async (req, res, next) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { status: "approved", isActive: true },
    { new: true }
  ).select("-password");
  if (!user) return next(new AppError("User not found", 404));
  res.status(200).json({ status: "success", data: { user } });
});

// ======================================================
// ADMIN: SOFT DELETE
// ======================================================
exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { status: "inactive", isActive: false }, // Soft delete logic
    { new: true }
  );

  if (!user) return next(new AppError("User not found", 404));
  res.status(204).json({ status: "success", data: null });
});

// ======================================================
// ADMIN: USER ACTIVITY LOGS
// ======================================================
exports.getUserActivity = catchAsync(async (req, res, next) => {
  const userId = req.params.id;
  const org = req.user.organizationId;
  const activities = await ActivityLog.find({ 
    organizationId: org, 
    $or: [{ userId: userId }, { user: userId }] 
  })
  .sort({ createdAt: -1 })
  .limit(200);

  res.status(200).json({ status: "success", results: activities.length, data: { activities } });
});

// const User = require("../models/userModel");
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const imageUploadService = require("../services/uploads/imageUploadService");

// // ======================================================
// // GET /users/me
// // ======================================================
// exports.getMyProfile = catchAsync(async (req, res, next) => {
//   const user = await User.findById(req.user.id).select("-password");
//   if (!user) return next(new AppError("User not found.", 404));
//   res.status(200).json({ status: "success", data: { user } });
// });

// // ======================================================
// // PATCH /users/me/photo
// // ======================================================
// exports.uploadProfilePhoto = catchAsync(async (req, res, next) => {
//   if (!req.file || !req.file.buffer)
//     return next(new AppError("Please upload an image file.", 400));
//   const folder = `profiles/${req.user.organizationId || "global"}`;
//   const imageUrl = await imageUploadService.uploadImage(req.file.buffer, folder);

//   const updatedUser = await User.findByIdAndUpdate(
//     req.user.id,
//     { avatar: imageUrl },
//     { new: true, runValidators: true, select: "-password" }
//   );

//   res.status(200).json({
//     status: "success",
//     message: "Profile photo updated successfully.",
//     data: { user: updatedUser },
//   });
// });

// // ======================================================
// // PATCH /users/me   (Update profile fields)
// // ======================================================
// exports.updateMyProfile = catchAsync(async (req, res, next) => {
//   // Block password change
//   if (req.body.password || req.body.passwordConfirm) {
//     return next(
//       new AppError("This route is not for password updates.", 400)
//     );
//   }

//   const allowedFields = ["name", "phone", "avatar", "branchId"];
//   const updates = {};
//   allowedFields.forEach((field) => {
//     if (req.body[field] !== undefined) updates[field] = req.body[field];
//   });

//   const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, {
//     new: true,
//     runValidators: true,
//   }).select("-password");

//   res.status(200).json({
//     status: "success",
//     data: { user: updatedUser },
//   });
// });

// // ======================================================
// // PATCH /users/update-password (Admin resets someone's password)
// // ======================================================
// exports.adminUpdatePassword = catchAsync(async (req, res, next) => {
//   const { password, passwordConfirm } = req.body;

//   if (!password || !passwordConfirm)
//     return next(new AppError("Provide password & passwordConfirm", 400));

//   if (password !== passwordConfirm)
//     return next(new AppError("Passwords do not match", 400));

//   const user = await User.findById(req.params.id).select("+password");
//   if (!user) return next(new AppError("User not found", 404));

//   user.password = password;
//   user.passwordConfirm = passwordConfirm;
//   await user.save();

//   res.status(200).json({
//     status: "success",
//     message: "Password updated successfully",
//   });
// });

// // ======================================================
// // GET /users (Admin only)
// // ======================================================
// exports.getAllUsers = catchAsync(async (req, res, next) => {
//   const users = await User.find({
//     organizationId: req.user.organizationId,
//   })
//     .populate("role")
//     .populate("branchId")
//     .select("-password");

//   res.status(200).json({
//     status: "success",
//     results: users.length,
//     data: { users },
//   });
// });

// // ======================================================
// // POST /users (Admin create user)
// // ======================================================
// exports.createUser = catchAsync(async (req, res, next) => {
//   const {
//     name,
//     email,
//     password,
//     passwordConfirm,
//     role,
//     branchId,
//     phone,
//   } = req.body;

//   if (!name || !email || !password || !passwordConfirm)
//     return next(new AppError("Missing required fields", 400));

//   if (password !== passwordConfirm)
//     return next(new AppError("Passwords do not match", 400));

//   const newUser = await User.create({
//     name,
//     email,
//     password,
//     passwordConfirm,
//     role,
//     branchId,
//     phone,
//     organizationId: req.user.organizationId,
//     status: "approved",
//   });

//   res.status(201).json({
//     status: "success",
//     data: { user: newUser },
//   });
// });

// // ======================================================
// // PATCH /users/:id (Admin update user)
// // ======================================================
// exports.updateUser = catchAsync(async (req, res, next) => {
//   const allowedFields = [
//     "name",
//     "phone",
//     "role",
//     "branchId",
//     "status",
//     "avatar",
//   ];
//   const updates = {};
//   allowedFields.forEach((field) => {
//     if (req.body[field] !== undefined) updates[field] = req.body[field];
//   });

//   const updatedUser = await User.findByIdAndUpdate(req.params.id, updates, {
//     new: true,
//     runValidators: true,
//   }).select("-password");

//   if (!updatedUser) return next(new AppError("User not found", 404));

//   res.status(200).json({
//     status: "success",
//     data: { user: updatedUser },
//   });
// });

// // ======================================================
// // DELETE /users/:id (Soft Delete)
// // ======================================================
// exports.deleteUser = catchAsync(async (req, res, next) => {
//   const user = await User.findByIdAndUpdate(
//     req.params.id,
//     { status: "inactive", isActive: false },
//     { new: true }
//   );

//   if (!user) return next(new AppError("User not found", 404));

//   res.status(204).json({ status: "success", data: null });
// });

// // GET /v1/users/search?q=
// exports.searchUsers = catchAsync(async (req, res, next) => {
//   const q = req.query.q || "";
//   const org = req.user.organizationId;
//   const users = await User.find({
//     organizationId: org,
//     $or: [
//       { name: { $regex: q, $options: "i" } },
//       { email: { $regex: q, $options: "i" } },
//       { phone: { $regex: q, $options: "i" } }
//     ]
//   }).limit(50).select("-password");
//   res.status(200).json({ status: "success", results: users.length, data: { users } });
// });



// // PATCH /v1/users/:id/deactivate
// exports.deactivateUser = catchAsync(async (req, res, next) => {
//   const user = await User.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     { status: "inactive", isActive: false },
//     { new: true }
//   ).select("-password");
//   if (!user) return next(new AppError("User not found", 404));
//   res.status(200).json({ status: "success", data: { user } });
// });

// // PATCH /v1/users/:id/activate
// exports.activateUser = catchAsync(async (req, res, next) => {
//   const user = await User.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     { status: "approved", isActive: true },
//     { new: true }
//   ).select("-password");
//   if (!user) return next(new AppError("User not found", 404));
//   res.status(200).json({ status: "success", data: { user } });
// });

// // GET /v1/users/:id/activity
// exports.getUserActivity = catchAsync(async (req, res, next) => {
//   const userId = req.params.id;
//   const org = req.user.organizationId;
//   const activities = await ActivityLog.find({ organizationId: org, user: userId }).sort({ createdAt: -1 }).limit(200);
//   res.status(200).json({ status: "success", results: activities.length, data: { activities } });
// });
