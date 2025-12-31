const User = require("../models/userModel");
const ActivityLog = require("../models/activityLogModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory"); // 👈 Import Factory
const imageUploadService = require("../services/uploads/imageUploadService");

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
      { path: "role", select: "name permissions" },
      { path: "branchId", select: "name address phone" },
    ],
  }),
];

exports.updateMyProfile = catchAsync(async (req, res, next) => {
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        "This route is not for password updates. Please use /updateMyPassword.",
        400,
      ),
    );
  }

  // 2. Filter allowed fields
  const allowedFields = ["name", "phone", "avatar", "preferences"];
  const filteredBody = {};
  Object.keys(req.body).forEach((el) => {
    if (allowedFields.includes(el)) filteredBody[el] = req.body[el];
  });

  // 3. Update user document
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  })
    .populate("role", "name")
    .populate("branchId", "name");

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

exports.uploadProfilePhoto = catchAsync(async (req, res, next) => {
  if (!req.file || !req.file.buffer)
    return next(new AppError("Please upload an image file.", 400));

  const folder = `profiles/${req.user.organizationId || "global"}`;
  const imageUrl = await imageUploadService.uploadImage(
    req.file.buffer,
    folder,
  );

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { avatar: imageUrl.url || imageUrl },
    { new: true, runValidators: true },
  ).select("-password");

  res.status(200).json({
    status: "success",
    message: "Profile photo updated successfully.",
    data: { user: updatedUser },
  });
});

exports.uploadUserPhotoByAdmin = catchAsync(async (req, res, next) => {
  // 1. Get the target User ID from the URL parameters
  const userId = req.params.id;

  // 2. Check for uploaded file
  if (!req.file || !req.file.buffer) {
    return next(new AppError("Please upload an image file.", 400));
  }

  // 3. Optional: Determine the upload folder based on the organization of the user being updated.
  //    First, fetch the user to get organizationId.
  const targetUser = await User.findById(userId).select("organizationId");
  if (!targetUser) {
    return next(new AppError("User not found.", 404));
  }

  const folder = `profiles/${targetUser.organizationId || "global"}`;

  // 4. Upload the image to the service (e.g., S3, Cloudinary)
  const imageUrl = await imageUploadService.uploadImage(
    req.file.buffer,
    folder,
  );

  // 5. Update the target user's avatar field
  const updatedUser = await User.findByIdAndUpdate(
    userId, // Use the ID from the URL parameter
    { avatar: imageUrl.url || imageUrl },
    { new: true, runValidators: true },
  ).select("-password"); // Exclude password from the returned object

  // 6. Send success response
  res.status(200).json({
    status: "success",
    message: `Profile photo for user ${userId} updated successfully by admin.`,
    data: { user: updatedUser },
  });
});
// ======================================================
// 2. ADMIN USER MANAGEMENT (Using Factory)
// ======================================================

// ✅ GET ALL: Automatically supports pagination, sort, filter, and search
// exports.getAllUsers = factory.getAll(User, {
//   searchFields: ['name', 'email', 'phone'],
//   populate: { path: 'role branchId', select: 'name' }
// });
exports.getAllUsers = factory.getAll(User, {
  searchFields: ["name", "email", "phone"],
  populate: [
    { path: "role", select: "name" },
    { path: "branchId", select: "name" },
    {
      path: "attendanceConfig.shiftId",
      select: "name startTime endTime duration isNightShift",
    },
  ],
});

// ✅ GET ONE: Fetches user with Roles and Branch populated
exports.getUser = factory.getOne(User, {
  populate: [
    { path: "role", select: "name permissions isSuperAdmin" },
    { path: "branchId", select: "name address city" },
  ],
});

// ✅ CREATE: Auto-assigns OrganizationId and CreatedBy from req.user
exports.createUser = factory.createOne(User);

// ✅ UPDATE: Auto-handles permissions and Organization check
exports.updateUser = factory.updateOne(User);

// ✅ DELETE: Handles Soft Delete automatically via Factory
exports.deleteUser = factory.deleteOne(User);

// ======================================================
// 3. SPECIFIC ACTIONS (Custom Logic Preserved)
// ======================================================

// Wrapper to support legacy ?q= search param using the new Factory
exports.searchUsers = (req, res, next) => {
  if (req.query.q) req.query.search = req.query.q; // Adapt 'q' to 'search' for ApiFeatures
  factory.getAll(User, {
    searchFields: ["name", "email", "phone"],
    populate: { path: "role branchId", select: "name" },
  })(req, res, next);
};

exports.adminUpdatePassword = catchAsync(async (req, res, next) => {
  const { password, passwordConfirm } = req.body;

  if (!password || !passwordConfirm)
    return next(new AppError("Provide password & passwordConfirm", 400));
  if (password !== passwordConfirm)
    return next(new AppError("Passwords do not match", 400));

  // Find user explicitly to run pre-save hooks (hashing)
  const user = await User.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  }).select("+password");
  if (!user) return next(new AppError("User not found", 404));

  user.password = password;
  user.passwordConfirm = passwordConfirm;
  await user.save();

  res
    .status(200)
    .json({ status: "success", message: "Password updated successfully" });
});

exports.deactivateUser = catchAsync(async (req, res, next) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { status: "inactive", isActive: false },
    { new: true },
  ).select("-password");
  if (!user) return next(new AppError("User not found", 404));
  res.status(200).json({ status: "success", data: { user } });
});

exports.activateUser = catchAsync(async (req, res, next) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { status: "approved", isActive: true },
    { new: true },
  ).select("-password");
  if (!user) return next(new AppError("User not found", 404));
  res.status(200).json({ status: "success", data: { user } });
});

exports.getUserActivity = catchAsync(async (req, res, next) => {
  const userId = req.params.id;
  const org = req.user.organizationId;

  // Note: ActivityLog might not support factory.getAll directly if it uses complex $or logic
  // Keeping custom logic here is safer for this specific query
  const activities = await ActivityLog.find({
    organizationId: org,
    $or: [{ userId: userId }, { user: userId }],
  })
    .sort({ createdAt: -1 })
    .limit(200);

  res
    .status(200)
    .json({
      status: "success",
      results: activities.length,
      data: { activities },
    });
});

// Get current user's permissions and role info
exports.getMyPermissions = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: "role",
    select: "name permissions isSuperAdmin",
  });

  // Check if user is organization owner
  const isOwner = await Organization.exists({
    _id: req.user.organizationId,
    owner: req.user._id,
  });

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

// Check if user has specific permission
exports.checkPermission = catchAsync(async (req, res) => {
  const { permission } = req.body;

  if (!permission) {
    return next(new AppError("Permission to check is required", 400));
  }

  const user = await User.findById(req.user._id).populate({
    path: "role",
    select: "permissions isSuperAdmin",
  });

  // Check if user is organization owner
  const isOwner = await Organization.exists({
    _id: req.user.organizationId,
    owner: req.user._id,
  });

  const hasPerm =
    isOwner ||
    user.role?.isSuperAdmin ||
    user.role?.permissions?.includes(permission);

  res.status(200).json({
    status: "success",
    data: {
      hasPermission: hasPerm,
      permission,
      isOwner,
      isSuperAdmin: isOwner ? true : user.role?.isSuperAdmin || false,
    },
  });
});
