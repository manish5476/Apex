'use strict';

const User = require("./user.model");
const Organization = require("../../organization/core/organization.model");
const ActivityLog = require("../../_legacy/models/activityLogModel");
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const factory = require("../../../core/utils/handlerFactory");
const imageUploadService = require("../../_legacy/services/uploads/imageUploadService");
const LeaveBalance = require("../../HRMS/models/leaveBalance.model"); // Adjust path as needed
const Shift = require("../../HRMS/models/shift.model"); // Adjust path
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

// 🟢 SECURITY: Ensure new users are locked to the creator's organization
// exports.createUser = [
//   (req, res, next) => {
//     req.body.organizationId = req.user.organizationId;
//     req.body.createdBy = req.user._id;
//     next();
//   },
//   factory.createOne(User)
// ];
exports.createUser = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Force Context & Defaults
    const orgId = req.user.organizationId;
    req.body.organizationId = orgId;
    req.body.createdBy = req.user._id;

    // 🔴 CRITICAL VALIDATION: Cross-Tenant & Existence Checks
    // We must ensure the Shift/Dept/Designation actually belong to THIS organization.
    const { employeeProfile, attendanceConfig } = req.body;

    // A. Validate Shift
    if (attendanceConfig?.shiftId) {
      const validShift = await Shift.findOne({ _id: attendanceConfig.shiftId, organizationId: orgId }).session(session);
      if (!validShift) throw new AppError("Invalid Shift ID or Shift belongs to another organization.", 400);
    }

    // B. Validate Department
    if (employeeProfile?.departmentId) {
      const validDept = await Department.findOne({ _id: employeeProfile.departmentId, organizationId: orgId }).session(session);
      if (!validDept) throw new AppError("Invalid Department ID.", 400);
    }

    // C. Validate Designation
    if (employeeProfile?.designationId) {
      const validDesig = await Designation.findOne({ _id: employeeProfile.designationId, organizationId: orgId }).session(session);
      if (!validDesig) throw new AppError("Invalid Designation ID.", 400);
    }

    // D. Validate Manager (Must exist in same Org)
    if (employeeProfile?.reportingManagerId) {
      const validManager = await User.findOne({ _id: employeeProfile.reportingManagerId, organizationId: orgId }).session(session);
      if (!validManager) throw new AppError("Reporting Manager not found in this organization.", 400);
    }

    // 2. Set Default Password if missing (Common in HR Onboarding)
    if (!req.body.password) {
      req.body.password = "Employee@123"; // You should ideally make this configurable or random
      req.body.passwordConfirm = "Employee@123";
    }

    // 3. Create the User Document
    const [newUser] = await User.create([req.body], { session });

    // 4. 🟢 HRMS MAGIC: Initialize Leave Balance
    // Calculate current financial year (e.g., "2024-2025")
    const now = new Date();
    const currentYear = now.getFullYear();
    const financialYear = now.getMonth() >= 3 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;

    await LeaveBalance.create([{
      user: newUser._id,
      organizationId: orgId,
      financialYear: financialYear,
      // Default Balances (Could be fetched from global settings in future)
      casualLeave: { total: 12, used: 0 },
      sickLeave: { total: 10, used: 0 },
      earnedLeave: { total: 0, used: 0 }
    }], { session });

    // 5. Commit Transaction
    await session.commitTransaction();
    session.endSession();

    // 6. Response (Hide Password)
    newUser.password = undefined;

    res.status(201).json({
      status: 'success',
      data: {
        user: newUser,
        message: 'Employee onboarded successfully with leave balance initialized.'
      }
    });

  } catch (error) {
    // 🔴 Rollback everything if any step fails
    await session.abortTransaction();
    session.endSession();
    
    // Handle specific Mongo errors (like duplicate email) manually for better UX
    if (error.code === 11000) {
      return next(new AppError("Email or Employee ID already exists.", 400));
    }
    return next(error);
  }
});


exports.updateUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  
  // 1. Basic Existence & Security Check
  if (!targetUser) return next(new AppError("User not found", 404));
  validateUserAction(req.user, targetUser); // Your existing helper

  // 2. 🟢 SECURITY: Sanitize Body
  // Prevent changing critical fields via this route
  const forbiddenFields = ["password", "passwordConfirm", "organizationId", "createdBy", "isOwner"];
  forbiddenFields.forEach(f => delete req.body[f]);

  // 3. 🟢 LOGIC: Transform Nested Updates
  // Mongoose `findByIdAndUpdate` with `req.body` will replace the ENTIRE 'employeeProfile' object if you aren't careful.
  // We need to convert it to dot notation (e.g., "employeeProfile.departmentId") to update partial fields.
  
  const updatePayload = { ...req.body };
  
  // Flatten 'employeeProfile' if present
  if (req.body.employeeProfile) {
    Object.keys(req.body.employeeProfile).forEach(key => {
      updatePayload[`employeeProfile.${key}`] = req.body.employeeProfile[key];
    });
    delete updatePayload.employeeProfile; // Remove the parent object to avoid overwrite
  }

  // Flatten 'attendanceConfig' if present
  if (req.body.attendanceConfig) {
    Object.keys(req.body.attendanceConfig).forEach(key => {
      updatePayload[`attendanceConfig.${key}`] = req.body.attendanceConfig[key];
    });
    delete updatePayload.attendanceConfig;
  }

  // 4. 🔴 VALIDATION: Check References before updating
  // If they are changing the manager, verify the new manager exists
  if (updatePayload['employeeProfile.reportingManagerId']) {
     const managerExists = await User.exists({ 
       _id: updatePayload['employeeProfile.reportingManagerId'], 
       organizationId: req.user.organizationId 
     });
     if (!managerExists) return next(new AppError("New Reporting Manager not found.", 400));
  }
  
  // If they are changing Shift, verify shift exists
  if (updatePayload['attendanceConfig.shiftId']) {
     const shiftExists = await Shift.exists({ 
       _id: updatePayload['attendanceConfig.shiftId'], 
       organizationId: req.user.organizationId 
     });
     if (!shiftExists) return next(new AppError("New Shift invalid or access denied.", 400));
  }

  // 5. Perform Update
  const updatedUser = await User.findByIdAndUpdate(req.params.id, { $set: updatePayload }, {
    new: true,
    runValidators: true,
  })
  .populate("employeeProfile.designationId", "title")
  .populate("employeeProfile.departmentId", "name")
  .populate("attendanceConfig.shiftId", "name startTime endTime");

  res.status(200).json({ 
    status: "success", 
    data: { user: updatedUser } 
  });
});

// exports.updateUser = catchAsync(async (req, res, next) => {
//   const targetUser = await User.findById(req.params.id).populate('role');
//   if (!targetUser) return next(new AppError("User not found", 404));

//   // Security Hierarchy check
//   validateUserAction(req.user, targetUser);

//   // 🟢 SECURITY: Prevent mass assignment on sensitive security fields
//   const forbiddenFields = ["password", "passwordConfirm", "organizationId", "createdBy"];
//   forbiddenFields.forEach(f => delete req.body[f]);

//   // Ownership transfer protection (Must be current owner to pass the torch)
//   if (req.body.isOwner && !req.user.isOwner) {
//     return next(new AppError("Only the current organization owner can designate a new owner.", 403));
//   }

//   const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
//     new: true,
//     runValidators: true,
//   }).populate("role", "name");

//   res.status(200).json({ status: "success", data: { user: updatedUser } });
// });







// HELPER: Get current Financial Year (e.g., "2025-2026")
// Assuming FY starts in April (India Standard)
const getFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 = Jan, 3 = April
  
  if (month >= 3) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
};