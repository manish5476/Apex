'use strict';

const User = require("./user.model");
const Organization = require("../../organization/core/organization.model");
const ActivityLog = require("../../_legacy/models/activityLogModel");
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const factory = require("../../../core/utils/handlerFactory");
const imageUploadService = require("../../_legacy/services/uploads/imageUploadService");

/**
 * INTERNAL UTILITY: Hierarchy & Tenant Guard
 * Ensures cross-tenant protection and respects the power structure.
 */
const validateUserAction = (actor, target) => {
  // 1. Cross-tenant protection (Strict Multitenancy)
  if (target.organizationId.toString() !== actor.organizationId.toString()) {
    throw new AppError("Access denied: User belongs to a different organization.", 403);
  }

  // 2. Owner protection (Organization Owner is the 'Root' of the tenant)
  if (target.isOwner && actor._id.toString() !== target._id.toString()) {
    throw new AppError("The Organization Owner cannot be modified or deleted by other users.", 403);
  }

  // 3. SuperAdmin Protection (A standard admin cannot modify a superadmin)
  const actorIsSuper = actor.role?.isSuperAdmin || actor.isSuperAdmin;
  const targetIsSuper = target.role?.isSuperAdmin || target.isSuperAdmin;
  
  if (targetIsSuper && !actorIsSuper) {
    throw new AppError("You do not have permission to modify a Super Administrator.", 403);
  }
};

// ======================================================
// 1. SELF MANAGEMENT (Logged in user)
// ======================================================

exports.getMyProfile = [
  catchAsync(async (req, res, next) => {
    req.params.id = req.user.id;
    next();
  }),
  factory.getOne(User, {
    populate: [
      { path: "role", select: "name permissions isSuperAdmin" },
      { path: "branchId", select: "name address phone" },
    ],
  }),
];

exports.updateMyProfile = catchAsync(async (req, res, next) => {
  // 🟢 SECURITY: Prevent privilege escalation via self-profile update
  const restrictedFields = ["password", "passwordConfirm", "role", "isOwner", "organizationId", "isActive", "status"];
  restrictedFields.forEach(field => {
    if (req.body[field] !== undefined) delete req.body[field];
  });

  // 🟢 PERFORMANCE: Whitelist allowed fields to prevent database pollution
  const allowedFields = ["name", "phone", "avatar", "preferences", "bio"];
  const filteredBody = {};
  Object.keys(req.body).forEach((el) => {
    if (allowedFields.includes(el)) filteredBody[el] = req.body[el];
  });

  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  }).populate("role", "name");

  res.status(200).json({ status: "success", data: { user: updatedUser } });
});

exports.uploadProfilePhoto = catchAsync(async (req, res, next) => {
  if (!req.file || !req.file.buffer) {
    return next(new AppError("Please upload an image file.", 400));
  }

  const folder = `profiles/${req.user.organizationId || "global"}`;
  const uploadResult = await imageUploadService.uploadImage(req.file.buffer, folder);

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { avatar: uploadResult.url || uploadResult },
    { new: true, runValidators: true },
  ).select("-password");

  res.status(200).json({
    status: "success",
    message: "Profile photo updated successfully.",
    data: { user: updatedUser },
  });
});

// ======================================================
// 2. ADMIN USER MANAGEMENT
// ======================================================

exports.getUser = factory.getOne(User, {
  populate: [
    { path: "role", select: "name permissions isSuperAdmin" },
    { path: "branchId", select: "name address city" },
  ],
});

exports.getAllUsers = catchAsync(async (req, res, next) => {
  // 🟢 SECURITY: Force strict tenant isolation in the query
  req.query.organizationId = req.user.organizationId;
  
  return factory.getAll(User, {
    searchFields: ["name", "email", "phone"],
    populate: [
      { path: "role", select: "name" },
      { path: "branchId", select: "name" },
      { path: "attendanceConfig.shiftId", select: "name startTime endTime" },
    ],
  })(req, res, next);
});

// 🟢 SECURITY: Ensure new users are locked to the creator's organization
exports.createUser = [
  (req, res, next) => {
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user._id;
    next();
  },
  factory.createOne(User)
];

exports.updateUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError("User not found", 404));

  // Security Hierarchy check
  validateUserAction(req.user, targetUser);

  // 🟢 SECURITY: Prevent mass assignment on sensitive security fields
  const forbiddenFields = ["password", "passwordConfirm", "organizationId", "createdBy"];
  forbiddenFields.forEach(f => delete req.body[f]);

  // Ownership transfer protection (Must be current owner to pass the torch)
  if (req.body.isOwner && !req.user.isOwner) {
    return next(new AppError("Only the current organization owner can designate a new owner.", 403));
  }

  const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate("role", "name");

  res.status(200).json({ status: "success", data: { user: updatedUser } });
});

exports.deleteUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError("User not found", 404));

  validateUserAction(req.user, targetUser);

  // 🟢 ARCHITECTURE: Perform soft delete to maintain referential integrity in logs/sales
  targetUser.isActive = false;
  targetUser.status = 'inactive';
  await targetUser.save({ validateBeforeSave: false });

  res.status(204).json({ status: "success", data: null });
});

exports.uploadUserPhotoByAdmin = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return next(new AppError("User not found.", 404));

  validateUserAction(req.user, targetUser);

  if (!req.file || !req.file.buffer) {
    return next(new AppError("Please upload an image file.", 400));
  }

  const folder = `profiles/${targetUser.organizationId}`;
  const uploadResult = await imageUploadService.uploadImage(req.file.buffer, folder);

  const updatedUser = await User.findByIdAndUpdate(
    targetUser._id,
    { avatar: uploadResult.url || uploadResult },
    { new: true, runValidators: true },
  ).select("-password");

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

// ======================================================
// 3. SPECIFIC ACTIONS & PERMISSIONS
// ======================================================

exports.deactivateUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError("User not found", 404));

  validateUserAction(req.user, targetUser);

  targetUser.status = "inactive";
  targetUser.isActive = false;
  await targetUser.save({ validateBeforeSave: false });

  res.status(200).json({ status: "success", data: { user: targetUser } });
});

exports.activateUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError("User not found", 404));

  validateUserAction(req.user, targetUser);

  targetUser.status = "approved";
  targetUser.isActive = true;
  await targetUser.save({ validateBeforeSave: false });

  res.status(200).json({ status: "success", data: { user: targetUser } });
});

exports.adminUpdatePassword = catchAsync(async (req, res, next) => {
  const { password, passwordConfirm } = req.body;
  if (password !== passwordConfirm) return next(new AppError("Passwords do not match", 400));

  const targetUser = await User.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  }).select("+password");

  if (!targetUser) return next(new AppError("User not found", 404));

  validateUserAction(req.user, targetUser);

  targetUser.password = password;
  targetUser.passwordConfirm = passwordConfirm;
  await targetUser.save();

  res.status(200).json({ status: "success", message: "Password updated successfully" });
});

exports.getUserActivity = catchAsync(async (req, res, next) => {
  const userId = req.params.id;
  const org = req.user.organizationId;

  // Verify target user is in same org before showing logs
  const targetExists = await User.exists({ _id: userId, organizationId: org });
  if (!targetExists) return next(new AppError("User activity not found or access denied.", 404));

  const activities = await ActivityLog.find({
    organizationId: org,
    $or: [{ userId: userId }, { user: userId }],
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.status(200).json({
    status: "success",
    results: activities.length,
    data: { activities },
  });
});

exports.getMyPermissions = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: "role",
    select: "name permissions isSuperAdmin",
  });

  // Verify Ownership context
  const org = await Organization.findById(req.user.organizationId).select('owner').lean();
  const isOwner = org?.owner?.toString() === req.user._id.toString();

  // Owners always get full access wildcard
  const permissions = isOwner ? ["*"] : user.role?.permissions || [];

  res.status(200).json({
    status: "success",
    data: {
      permissions,
      role: user.role?.name,
      isOwner,
      isSuperAdmin: isOwner ? true : user.role?.isSuperAdmin || false,
      organizationId: req.user.organizationId,
    },
  });
});

exports.checkPermission = catchAsync(async (req, res, next) => {
  const { permission } = req.body;
  if (!permission) return next(new AppError("Permission name is required", 400));

  const user = await User.findById(req.user._id).populate({
    path: "role",
    select: "permissions isSuperAdmin",
  });

  const org = await Organization.findById(req.user.organizationId).select('owner').lean();
  const isOwner = org?.owner?.toString() === req.user._id.toString();

  const hasPerm =
    isOwner ||
    user.role?.isSuperAdmin ||
    user.role?.permissions?.includes(permission) ||
    user.role?.permissions?.includes("*");

  res.status(200).json({
    status: "success",
    data: {
      hasPermission: hasPerm,
      permission,
      isOwner,
    },
  });
});

exports.searchUsers = (req, res, next) => {
  if (req.query.q) req.query.search = req.query.q;
  // Enforce Tenant Isolation for searches
  req.query.organizationId = req.user.organizationId;
  
  factory.getAll(User, {
    searchFields: ["name", "email", "phone"],
    populate: { path: "role branchId", select: "name" },
  })(req, res, next);
};
// const User = require("./user.model");
// const ActivityLog = require("../../_legacy/models/activityLogModel");
// const catchAsync = require("../../../core/utils/catchAsync");
// const AppError = require("../../../core/utils/appError");
// const factory = require("../../../core/utils/handlerFactory"); // 👈 Import Factory
// const imageUploadService = require("../../_legacy/services/uploads/imageUploadService");

// // 🟢 FIX: Hierarchy & Tenant Guard
// const checkTargetHierarchy = (req, targetUser) => {
//   // 1. Cross-tenant protection
//   if (targetUser.organizationId.toString() !== req.user.organizationId.toString()) {
//     throw new AppError("You do not have permission to access users outside your organization.", 403);
//   }
//   // 2. Owner protection
//   if (targetUser.isOwner && req.user._id.toString() !== targetUser._id.toString()) {
//     throw new AppError("The Organization Owner cannot be modified or deleted by other users.", 403);
//   }
// };

// // ======================================================
// // 1. SELF MANAGEMENT (Logged in user)
// // ======================================================
// exports.getMyProfile = [
//   catchAsync(async (req, res, next) => {
//     req.params.id = req.user.id;
//     next();
//   }),
//   factory.getOne(User, {
//     populate: [
//       { path: "role", select: "name permissions" },
//       { path: "branchId", select: "name address phone" },
//     ],
//   }),
// ];

// // ======================================================
// // 1. SELF MANAGEMENT
// // ======================================================
// exports.updateMyProfile = catchAsync(async (req, res, next) => {
//   if (req.body.password || req.body.passwordConfirm || req.body.role || req.body.isOwner) {
//     return next(new AppError("This route is only for profile data (name, phone, avatar).", 400));
//   }

//   // 🟢 PERFECTION: Whitelist allowed fields to prevent privilege escalation
//   const allowedFields = ["name", "phone", "avatar", "preferences"];
//   const filteredBody = {};
//   Object.keys(req.body).forEach((el) => {
//     if (allowedFields.includes(el)) filteredBody[el] = req.body[el];
//   });

//   const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
//     new: true,
//     runValidators: true,
//   }).populate("role", "name");

//   res.status(200).json({ status: "success", data: { user: updatedUser } });
// });

// exports.uploadProfilePhoto = catchAsync(async (req, res, next) => {
//   if (!req.file || !req.file.buffer)
//     return next(new AppError("Please upload an image file.", 400));

//   const folder = `profiles/${req.user.organizationId || "global"}`;
//   const imageUrl = await imageUploadService.uploadImage(
//     req.file.buffer,
//     folder,
//   );

//   const updatedUser = await User.findByIdAndUpdate(
//     req.user.id,
//     { avatar: imageUrl.url || imageUrl },
//     { new: true, runValidators: true },
//   ).select("-password");

//   res.status(200).json({
//     status: "success",
//     message: "Profile photo updated successfully.",
//     data: { user: updatedUser },
//   });
// });

// exports.uploadUserPhotoByAdmin = catchAsync(async (req, res, next) => {
//   // 1. Get the target User ID from the URL parameters
//   const userId = req.params.id;

//   // 2. Check for uploaded file
//   if (!req.file || !req.file.buffer) {
//     return next(new AppError("Please upload an image file.", 400));
//   }

//   // 3. Optional: Determine the upload folder based on the organization of the user being updated.
//   //    First, fetch the user to get organizationId.
//   const targetUser = await User.findById(userId).select("organizationId");
//   if (!targetUser) {
//     return next(new AppError("User not found.", 404));
//   }

//   const folder = `profiles/${targetUser.organizationId || "global"}`;

//   // 4. Upload the image to the service (e.g., S3, Cloudinary)
//   const imageUrl = await imageUploadService.uploadImage(
//     req.file.buffer,
//     folder,
//   );

//   // 5. Update the target user's avatar field
//   const updatedUser = await User.findByIdAndUpdate(
//     userId, // Use the ID from the URL parameter
//     { avatar: imageUrl.url || imageUrl },
//     { new: true, runValidators: true },
//   ).select("-password"); // Exclude password from the returned object

//   // 6. Send success response
//   res.status(200).json({
//     status: "success",
//     message: `Profile photo for user ${userId} updated successfully by admin.`,
//     data: { user: updatedUser },
//   });
// });
// // ======================================================
// // 2. ADMIN USER MANAGEMENT (Using Factory)
// // ======================================================


// // ✅ GET ONE: Fetches user with Roles and Branch populated
// exports.getUser = factory.getOne(User, {
//   populate: [
//     { path: "role", select: "name permissions isSuperAdmin" },
//     { path: "branchId", select: "name address city" },
//   ],
// });

// // 🟢 FIX: Ensure factory only pulls users for THIS organization
// exports.getAllUsers = (req, res, next) => {
//   req.query.organizationId = req.user.organizationId; // Force tenant filter
//   factory.getAll(User, {
//     searchFields: ["name", "email", "phone"],
//     populate: [
//       { path: "role", select: "name" },
//       { path: "branchId", select: "name" },
//       { path: "attendanceConfig.shiftId", select: "name startTime endTime" },
//     ],
//   })(req, res, next);
// };

// exports.updateUser = catchAsync(async (req, res, next) => {
//   const targetUser = await User.findById(req.params.id);
//   if (!targetUser) return next(new AppError("User not found", 404));

//   // 🟢 PERFECTION: Hierarchy & Tenant Check
//   checkTargetHierarchy(req, targetUser);

//   // Prevent a non-owner from making someone else an owner
//   if (req.body.isOwner && !req.user.isOwner) {
//     return next(new AppError("Only the current owner can designate a new owner.", 403));
//   }

//   const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
//     new: true,
//     runValidators: true,
//   });

//   res.status(200).json({ status: "success", data: { user: updatedUser } });
// });

// // ✅ CREATE: Auto-assigns OrganizationId and CreatedBy from req.user
// exports.createUser = factory.createOne(User);

// exports.deleteUser = catchAsync(async (req, res, next) => {
//   const targetUser = await User.findById(req.params.id);
//   if (!targetUser) return next(new AppError("User not found", 404));

//   // 🟢 PERFECTION: Hierarchy & Tenant Check
//   checkTargetHierarchy(req, targetUser);

//   // Perform soft delete
//   targetUser.isActive = false;
//   targetUser.status = 'inactive';
//   await targetUser.save();

//   res.status(204).json({ status: "success", data: null });
// });
// // // ✅ UPDATE: Auto-handles permissions and Organization check
// // exports.updateUser = factory.updateOne(User);

// // // ✅ DELETE: Handles Soft Delete automatically via Factory
// // exports.deleteUser = factory.deleteOne(User);

// // ======================================================
// // 3. SPECIFIC ACTIONS (Custom Logic Preserved)
// // ======================================================

// // Wrapper to support legacy ?q= search param using the new Factory
// exports.searchUsers = (req, res, next) => {
//   if (req.query.q) req.query.search = req.query.q; // Adapt 'q' to 'search' for ApiFeatures
//   factory.getAll(User, {
//     searchFields: ["name", "email", "phone"],
//     populate: { path: "role branchId", select: "name" },
//   })(req, res, next);
// };

// exports.adminUpdatePassword = catchAsync(async (req, res, next) => {
//   const { password, passwordConfirm } = req.body;
//   if (password !== passwordConfirm) return next(new AppError("Passwords do not match", 400));

//   const user = await User.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId, // Tenant Isolation
//   }).select("+password");

//   if (!user) return next(new AppError("User not found", 404));

//   // 🟢 PERFECTION: Cannot reset owner password unless you ARE the owner
//   if (user.isOwner && req.user._id.toString() !== user._id.toString()) {
//     return next(new AppError("Admin cannot reset the Owner's password.", 403));
//   }

//   user.password = password;
//   user.passwordConfirm = passwordConfirm;
//   await user.save();

//   res.status(200).json({ status: "success", message: "Password updated successfully" });
// });


// exports.deactivateUser = catchAsync(async (req, res, next) => {
//   const user = await User.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     { status: "inactive", isActive: false },
//     { new: true },
//   ).select("-password");
//   if (!user) return next(new AppError("User not found", 404));
//   res.status(200).json({ status: "success", data: { user } });
// });

// exports.activateUser = catchAsync(async (req, res, next) => {
//   const user = await User.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     { status: "approved", isActive: true },
//     { new: true },
//   ).select("-password");
//   if (!user) return next(new AppError("User not found", 404));
//   res.status(200).json({ status: "success", data: { user } });
// });

// exports.getUserActivity = catchAsync(async (req, res, next) => {
//   const userId = req.params.id;
//   const org = req.user.organizationId;

//   // Note: ActivityLog might not support factory.getAll directly if it uses complex $or logic
//   // Keeping custom logic here is safer for this specific query
//   const activities = await ActivityLog.find({
//     organizationId: org,
//     $or: [{ userId: userId }, { user: userId }],
//   })
//     .sort({ createdAt: -1 })
//     .limit(200);

//   res
//     .status(200)
//     .json({
//       status: "success",
//       results: activities.length,
//       data: { activities },
//     });
// });

// // Get current user's permissions and role info
// exports.getMyPermissions = catchAsync(async (req, res) => {
//   const user = await User.findById(req.user._id).populate({
//     path: "role",
//     select: "name permissions isSuperAdmin",
//   });

//   // Check if user is organization owner
//   const isOwner = await Organization.exists({
//     _id: req.user.organizationId,
//     owner: req.user._id,
//   });

//   const permissions = isOwner ? ["*"] : user.role?.permissions || [];

//   res.status(200).json({
//     status: "success",
//     data: {
//       permissions,
//       role: user.role?.name,
//       isOwner,
//       isSuperAdmin: isOwner ? true : user.role?.isSuperAdmin || false,
//       organizationId: req.user.organizationId,
//     },
//   });
// });

// // Check if user has specific permission
// exports.checkPermission = catchAsync(async (req, res) => {
//   const { permission } = req.body;

//   if (!permission) {
//     return next(new AppError("Permission to check is required", 400));
//   }

//   const user = await User.findById(req.user._id).populate({
//     path: "role",
//     select: "permissions isSuperAdmin",
//   });

//   // Check if user is organization owner
//   const isOwner = await Organization.exists({
//     _id: req.user.organizationId,
//     owner: req.user._id,
//   });

//   const hasPerm =
//     isOwner ||
//     user.role?.isSuperAdmin ||
//     user.role?.permissions?.includes(permission);

//   res.status(200).json({
//     status: "success",
//     data: {
//       hasPermission: hasPerm,
//       permission,
//       isOwner,
//       isSuperAdmin: isOwner ? true : user.role?.isSuperAdmin || false,
//     },
//   });
// });
