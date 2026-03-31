'use strict';

const mongoose = require('mongoose');
const User = require("./user.model");
const Organization = require("../../organization/core/organization.model");
const ActivityLog = require("../../activity/activityLogModel");
const LeaveBalance = require("../../HRMS/models/leaveBalance.model");
const Shift = require("../../HRMS/models/shift.model");
const Department = require("../../HRMS/models/department.model");
const Designation = require("../../HRMS/models/designation.model");
const Branch = require("../../organization/core/branch.model");
const Session = require("./session.model");

const catchAsync = require("../../../core/utils/api/catchAsync");
const AppError = require("../../../core/utils/api/appError");
const factory = require("../../../core/utils/api/handlerFactory");
const imageUploadService = require("../../uploads/imageUploadService");

// ✅ FIXED: Added VALID_TAGS to import — required by getMyPermissions & updatePermissionOverrides
const { PERMISSIONS_LIST, VALID_TAGS, getPermissionGroups } = require('../../../config/permissions');

// ======================================================
//  INTERNAL HELPERS
// ======================================================

const getFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

/**
 * Sensitive permission groups — only owners can grant these
 */
const SENSITIVE_TAGS = PERMISSIONS_LIST
  .filter(p => ['System', 'Organization', 'Platform'].includes(p.group))
  .map(p => p.tag);

/**
 * Merge role permissions + per-user overrides → effective permission set
 * Used by getMyPermissions & checkPermission to stay consistent
 */
const mergePermissions = (rolePermissions = [], overrides = {}) => {
  const base = new Set(rolePermissions);
  (overrides.granted ?? []).forEach(p => base.add(p));
  (overrides.revoked ?? []).forEach(p => base.delete(p));
  return [...base];
};

/**
 * 🛡️ SECURITY: Hierarchy & Tenant Guard
 */
const validateUserAction = (actor, target) => {
  if (target.organizationId.toString() !== actor.organizationId.toString()) {
    throw new AppError("Access denied: User belongs to a different organization.", 403);
  }
  if (target.isOwner && actor._id.toString() !== target._id.toString()) {
    throw new AppError("The Organization Owner cannot be modified or deleted by other users.", 403);
  }
  const actorIsSuper = actor.role?.isSuperAdmin || actor.isSuperAdmin;
  const targetIsSuper = target.role?.isSuperAdmin || target.isSuperAdmin;
  if (targetIsSuper && !actorIsSuper) {
    throw new AppError("You do not have permission to modify a Super Administrator.", 403);
  }
};

const validatePhone = (phone) => {
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone);
};

const cleanPhone = (phone) => {
  return phone.replace(/[\s\-\(\)\+]/g, '');
};

// ======================================================
//  0. PERMISSIONS METADATA
// ======================================================

/**
 * @desc    Get all available permissions (grouped)
 * @route   GET /api/v1/users/permissions/available
 * @access  Private (Admin/Owner)
 */
exports.getAllAvailablePermissions = (req, res) => {
  res.status(200).json({
    status: 'success',
    results: PERMISSIONS_LIST.length,
    data: {
      groups: getPermissionGroups(),
      permissions: PERMISSIONS_LIST
    }
  });
};

// ======================================================
//  1. SELF MANAGEMENT (Logged in user)
// ======================================================

/**
 * @desc    Get my profile
 * @route   GET /api/v1/users/me
 * @access  Private
 */
exports.getMyProfile = [
  catchAsync(async (req, res, next) => {
    req.params.id = req.user.id;
    next();
  }),
  factory.getOne(User, {
    populate: [
      { path: "role", select: "name permissions isSuperAdmin" },
      { path: "branchId", select: "name address phone" },
      { path: "employeeProfile.departmentId", select: "name" },
      { path: "employeeProfile.designationId", select: "title" },
      { path: "employeeProfile.reportingManagerId", select: "name avatar" },
      { path: "attendanceConfig.shiftId", select: "name startTime endTime" },
      { path: "attendanceConfig.shiftGroupId", select: "name" },
      { path: "attendanceConfig.geoFenceId", select: "name" }
    ],
  }),
];

/**
 * @desc    Update my profile
 * @route   PATCH /api/v1/users/me
 * @access  Private
 */
exports.updateMyProfile = catchAsync(async (req, res, next) => {
  // 🛡️ SECURITY: Prevent self privilege escalation
  // ✅ FIXED: Added permissionOverrides to restricted fields
  const restrictedFields = [
    "password", "passwordConfirm", "role", "isOwner", "organizationId",
    "isActive", "status", "email", "phone", "employeeProfile.employeeId",
    "isLoginBlocked", "loginAttempts", "lockUntil", "refreshTokens",
    "permissionOverrides", "isSuperAdmin", "branchId"
  ];

  restrictedFields.forEach(field => {
    if (req.body[field] !== undefined) delete req.body[field];
  });

  // Allowlist — only these fields can be self-updated
  const allowedFields = [
    "name", "avatar", "language", "themeId", "upiId",
    "preferences.theme", "preferences.notifications",
    "employeeProfile.secondaryPhone", "employeeProfile.guarantorDetails",
    "employeeProfile.workLocation"
  ];

  const filteredBody = {};
  Object.keys(req.body).forEach((key) => {
    if (
      allowedFields.includes(key) ||
      key.startsWith('preferences.') ||
      key.startsWith('employeeProfile.')
    ) {
      // ✅ Double-check: never allow employeeProfile.employeeId through prefix match
      if (key === 'employeeProfile.employeeId') return;
      filteredBody[key] = req.body[key];
    }
  });

  if (filteredBody['employeeProfile.secondaryPhone'] || filteredBody.employeeProfile?.secondaryPhone) {
    const phone = filteredBody['employeeProfile.secondaryPhone'] || filteredBody.employeeProfile?.secondaryPhone;
    if (!validatePhone(phone)) {
      return next(new AppError("Please provide a valid secondary phone number", 400));
    }
    filteredBody['employeeProfile.secondaryPhone'] = cleanPhone(phone);
    delete filteredBody.employeeProfile;
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { $set: filteredBody },
    { new: true, runValidators: true }
  )
    .populate("role", "name permissions isSuperAdmin")
    .select("-password -refreshTokens -loginAttempts -lockUntil -permissionOverrides");

  res.status(200).json({
    status: "success",
    data: { user: updatedUser }
  });
});

/**
 * @desc    Upload my profile photo
 * @route   POST /api/v1/users/me/photo
 * @access  Private
 */
exports.uploadProfilePhoto = catchAsync(async (req, res, next) => {
  if (!req.file || !req.file.buffer) {
    return next(new AppError("Please upload an image file.", 400));
  }

  const currentUser = await User.findById(req.user.id);
  if (currentUser.avatarAsset) {
    try {
      await imageUploadService.deleteFullAsset(currentUser.avatarAsset, req.user.organizationId);
    } catch (err) {
      console.warn("⚠️ Old avatar cleanup skipped:", err.message);
    }
  }

  const asset = await imageUploadService.uploadAndRecord(req.file, req.user, 'avatar');

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { avatar: asset.url, avatarAsset: asset._id },
    { new: true, runValidators: true }
  ).select("-password -refreshTokens -loginAttempts -lockUntil -permissionOverrides");

  res.status(200).json({
    status: "success",
    message: "Profile photo updated successfully.",
    data: { user: updatedUser, asset }
  });
});

/**
 * @desc    Get my effective permissions (role + overrides merged)
 * @route   GET /api/v1/users/me/permissions
 * @access  Private
 */
exports.getMyPermissions = catchAsync(async (req, res) => {
  // ✅ FIXED: select permissionOverrides + use mergePermissions helper
  const user = await User.findById(req.user._id)
    .populate('role', 'name permissions isSuperAdmin')
    .select('role permissionOverrides isSuperAdmin isOwner emailVerified status')
    .lean();

  const org = await Organization.findById(req.user.organizationId)
    .select('owner')
    .lean();

  const isOwner = org?.owner?.toString() === req.user._id.toString();

  if (isOwner || user.role?.isSuperAdmin) {
    return res.status(200).json({
      status: 'success',
      data: {
        permissions: VALID_TAGS,
        role: user.role?.name,
        isOwner,
        isSuperAdmin: true,
        overrides: { granted: [], revoked: [] },
        emailVerified: user.emailVerified,
        status: user.status
      }
    });
  }

  const permissions = mergePermissions(user.role?.permissions, user.permissionOverrides);

  res.status(200).json({
    status: 'success',
    data: {
      permissions,
      role: user.role?.name,
      isOwner: false,
      isSuperAdmin: false,
      overrides: {
        granted: user.permissionOverrides?.granted ?? [],
        revoked: user.permissionOverrides?.revoked ?? []
      },
      emailVerified: user.emailVerified,
      status: user.status
    }
  });
});

/**
 * @desc    Update per-user permission overrides
 * @route   PATCH /api/v1/users/:id/permission-overrides
 * @access  Private (Admin/Owner only)
 */
exports.updatePermissionOverrides = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const userId = req.params.id;
  const { grant = [], revoke = [] } = req.body;

  // Validate arrays
  if (!Array.isArray(grant) || !Array.isArray(revoke)) {
    return next(new AppError('grant and revoke must be arrays', 400));
  }

  // Validate all tags are known
  const allTags = [...grant, ...revoke];
  const invalid = allTags.filter(p => !VALID_TAGS.includes(p));
  if (invalid.length) {
    return next(new AppError(`Invalid permissions: ${invalid.join(', ')}`, 400));
  }

  // Can't grant AND revoke same tag
  const conflict = grant.filter(p => revoke.includes(p));
  if (conflict.length) {
    return next(new AppError(`Cannot grant and revoke same permission: ${conflict.join(', ')}`, 400));
  }

  const target = await User.findOne({ _id: userId, organizationId: orgId }).populate('role');
  if (!target) return next(new AppError('User not found', 404));

  validateUserAction(req.user, target);

  // Only owners can grant system-level permissions
  if (!req.user.isOwner && grant.some(p => SENSITIVE_TAGS.includes(p))) {
    return next(new AppError('Only owners can grant system-level permissions', 403));
  }

  // Prevent granting permissions the actor doesn't have themselves (unless owner)
  if (!req.user.isOwner) {
    const actorUser = await User.findById(req.user._id)
      .populate('role', 'permissions')
      .select('permissionOverrides')
      .lean();
    const actorPerms = new Set(mergePermissions(actorUser.role?.permissions, actorUser.permissionOverrides));
    const cannotGrant = grant.filter(p => !actorPerms.has(p));
    if (cannotGrant.length) {
      return next(new AppError(`You cannot grant permissions you don't have: ${cannotGrant.join(', ')}`, 403));
    }
  }

  target.permissionOverrides = { granted: grant, revoked: revoke };
  target.updatedBy = req.user._id;
  await target.save({ validateBeforeSave: false });

  // ✅ Emit only to this specific user's socket room
  const io = req.app.get('io');
  if (io) {
    const roomId = `user:${String(userId)}`;

    // 💡 DIAGNOSTIC: Check if anyone is actually in this room
    const room = io.sockets.adapter.rooms.get(roomId);
    const memberCount = room ? room.size : 0;

    console.log(`[SOCKET DEBUG] Emitting override update to room ${roomId} (${memberCount} active members)`);

    io.to(roomId).emit('permissions:updated', {
      type: 'override',
      userId,
      timestamp: new Date().toISOString()
    });
  } else {
    console.warn('[SOCKET DEBUG] Socket.io not found on app instance');
  }

  res.status(200).json({
    status: 'success',
    message: 'Permission overrides updated',
    data: {
      userId,
      overrides: target.permissionOverrides
    }
  });
});

/**
 * @desc    Get my devices/sessions
 * @route   GET /api/v1/users/me/devices
 * @access  Private
 */
exports.getMyDevices = catchAsync(async (req, res) => {
  const sessions = await Session.find({
    userId: req.user._id,
    isValid: true
  })
    .select('-token -refreshToken')
    .sort('-lastActivityAt');

  const currentSessionId = req.session?._id;

  res.status(200).json({
    status: "success",
    results: sessions.length,
    data: { currentSessionId, devices: sessions }
  });
});

/**
 * @desc    Revoke a device session
 * @route   DELETE /api/v1/users/me/devices/:sessionId
 * @access  Private
 */
exports.revokeDevice = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;

  const session = await Session.findOne({
    _id: sessionId,
    userId: req.user._id,
    isValid: true
  });

  if (!session) {
    return next(new AppError("Session not found or already expired", 404));
  }

  if (req.session?._id && req.session._id.toString() === sessionId) {
    return next(new AppError("Cannot revoke current session. Use logout instead.", 400));
  }

  session.isValid = false;
  session.terminatedAt = new Date();
  await session.save();

  res.status(200).json({
    status: "success",
    message: "Device session revoked successfully"
  });
});

// ======================================================
//  2. USER MANAGEMENT (Admin/HR) - READ OPERATIONS
// ======================================================

/**
 * @desc    Get all users
 * @route   GET /api/v1/users
 * @access  Private (Admin/HR)
 */
exports.getAllUsers = catchAsync(async (req, res, next) => {
  // 🛡️ Force strict tenant isolation
  req.query.organizationId = req.user.organizationId;

  if (req.query.department) {
    const dept = await Department.findOne({
      name: req.query.department,
      organizationId: req.user.organizationId
    });
    if (dept) req.query['employeeProfile.departmentId'] = dept._id;
    delete req.query.department;
  }

  if (req.query.designation) {
    const desig = await Designation.findOne({
      title: req.query.designation,
      organizationId: req.user.organizationId
    });
    if (desig) req.query['employeeProfile.designationId'] = desig._id;
    delete req.query.designation;
  }

  if (req.query.reportingTo) {
    req.query['employeeProfile.reportingManagerId'] = req.query.reportingTo;
    delete req.query.reportingTo;
  }

  if (req.query.employmentType) {
    req.query['employeeProfile.employmentType'] = req.query.employmentType;
    delete req.query.employmentType;
  }

  return factory.getAll(User, {
    searchFields: ["name", "email", "phone", "employeeProfile.employeeId", "employeeProfile.secondaryPhone"],
    // ✅ FIXED: Exclude sensitive fields from list response
    select: '-permissionOverrides -loginAttempts -lockUntil -refreshTokens -passwordResetToken -emailVerificationToken -bankDetails',
    populate: [
      { path: "role", select: "name" },
      { path: "branchId", select: "name" },
      { path: "employeeProfile.departmentId", select: "name" },
      { path: "employeeProfile.designationId", select: "title" },
      { path: "employeeProfile.reportingManagerId", select: "name" },
      { path: "attendanceConfig.shiftId", select: "name" }
    ],
  })(req, res, next);
});

/**
 * @desc    Get user by ID
 * @route   GET /api/v1/users/:id
 * @access  Private (Admin/HR)
 */
exports.getUser = factory.getOne(User, {
  populate: [
    { path: "role", select: "name permissions isSuperAdmin" },
    { path: "branchId", select: "name address city" },
    { path: "employeeProfile.designationId", select: "title" },
    { path: "employeeProfile.departmentId", select: "name" },
    { path: "employeeProfile.reportingManagerId", select: "name avatar" },
    { path: "attendanceConfig.shiftId", select: "name startTime endTime" },
    { path: "attendanceConfig.shiftGroupId", select: "name" },
    { path: "attendanceConfig.geoFenceId", select: "name" },
    { path: "createdBy", select: "name" },
    { path: "updatedBy", select: "name" },
    { path: "blockedBy", select: "name" }
  ],
});

/**
 * @desc    Search users
 * @route   GET /api/v1/users/search
 * @access  Private
 */
exports.searchUsers = (req, res, next) => {
  if (req.query.q) req.query.search = req.query.q;
  req.query.organizationId = req.user.organizationId;

  factory.getAll(User, {
    searchFields: ["name", "email", "phone", "employeeProfile.employeeId"],
    select: '-permissionOverrides -loginAttempts -lockUntil -refreshTokens -passwordResetToken -emailVerificationToken',
    populate: [
      { path: "role", select: "name" },
      { path: "branchId", select: "name" }
    ],
  })(req, res, next);
};

/**
 * @desc    Get user activity logs
 * @route   GET /api/v1/users/:id/activity
 * @access  Private (Admin/HR)
 */
exports.getUserActivity = catchAsync(async (req, res, next) => {
  const userId = req.params.id;
  const org = req.user.organizationId;

  const targetExists = await User.exists({ _id: userId, organizationId: org });
  if (!targetExists) {
    return next(new AppError("User activity not found or access denied.", 404));
  }

  const [activities, sessions] = await Promise.all([
    ActivityLog.find({
      organizationId: org,
      $or: [{ userId }, { user: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),

    Session.find({ userId, organizationId: org })
      .select('-token -refreshToken')
      .sort('-createdAt')
      .limit(50)
      .lean()
  ]);

  res.status(200).json({
    status: "success",
    data: {
      activities,
      sessions,
      totalActivities: activities.length,
      totalSessions: sessions.length
    }
  });
});

/**
 * @desc    Get organization hierarchy (reporting structure)
 * @route   GET /api/v1/users/hierarchy
 * @access  Private
 */
exports.getOrgHierarchy = catchAsync(async (req, res, next) => {
  const users = await User.find({
    organizationId: req.user.organizationId,
    isActive: true,
    status: 'approved'
  })
    .select('name avatar email employeeProfile.designationId employeeProfile.departmentId employeeProfile.reportingManagerId')
    .populate('employeeProfile.designationId', 'title level')
    .populate('employeeProfile.departmentId', 'name')
    .lean();

  const userMap = {};
  const roots = [];

  users.forEach(user => {
    userMap[user._id] = { ...user, reportees: [] };
  });

  users.forEach(user => {
    const managerId = user.employeeProfile?.reportingManagerId?.toString();
    if (managerId && userMap[managerId]) {
      userMap[managerId].reportees.push(userMap[user._id]);
    } else {
      roots.push(userMap[user._id]);
    }
  });

  res.status(200).json({
    status: 'success',
    data: { totalUsers: users.length, hierarchy: roots }
  });
});

/**
 * @desc    Get users by department
 * @route   GET /api/v1/users/by-department/:departmentId
 * @access  Private
 */
exports.getUsersByDepartment = catchAsync(async (req, res, next) => {
  const { departmentId } = req.params;

  const department = await Department.findOne({
    _id: departmentId,
    organizationId: req.user.organizationId
  });

  if (!department) return next(new AppError("Department not found", 404));

  const users = await User.find({
    organizationId: req.user.organizationId,
    'employeeProfile.departmentId': departmentId,
    isActive: true
  })
    .select('name email phone avatar employeeProfile.designationId employeeProfile.employeeId')
    .populate('employeeProfile.designationId', 'title')
    .sort('name');

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { users }
  });
});

// ======================================================
//  3. USER MANAGEMENT (Admin/HR) - WRITE OPERATIONS
// ======================================================

/**
 * @desc    Create new user (with leave balance)
 * @route   POST /api/v1/users
 * @access  Private (Admin/HR)
 */
exports.createUser = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orgId = req.user.organizationId;
    req.body.organizationId = orgId;
    req.body.createdBy = req.user._id;
    req.body.updatedBy = req.user._id;

    // ✅ FIXED: Strip permission overrides at creation — must use dedicated endpoint
    delete req.body.permissionOverrides;
    delete req.body.isOwner;
    delete req.body.isSuperAdmin;
    delete req.body.loginAttempts;
    delete req.body.lockUntil;
    delete req.body.refreshTokens;
    delete req.body.isLoginBlocked;

    const { employeeProfile, attendanceConfig, phone } = req.body;

    if (phone) {
      if (!validatePhone(phone)) throw new AppError("Please provide a valid primary phone number", 400);
      req.body.phone = cleanPhone(phone);
    }

    if (employeeProfile?.secondaryPhone) {
      if (!validatePhone(employeeProfile.secondaryPhone)) throw new AppError("Please provide a valid secondary phone number", 400);
      employeeProfile.secondaryPhone = cleanPhone(employeeProfile.secondaryPhone);
    }

    if (attendanceConfig?.shiftId) {
      const validShift = await Shift.findOne({ _id: attendanceConfig.shiftId, organizationId: orgId }).session(session);
      if (!validShift) throw new AppError("Invalid Shift ID.", 400);
    }

    if (employeeProfile?.departmentId) {
      const validDept = await Department.findOne({ _id: employeeProfile.departmentId, organizationId: orgId }).session(session);
      if (!validDept) throw new AppError("Invalid Department ID.", 400);
    }

    if (employeeProfile?.designationId) {
      const validDesig = await Designation.findOne({ _id: employeeProfile.designationId, organizationId: orgId }).session(session);
      if (!validDesig) throw new AppError("Invalid Designation ID.", 400);
    }

    if (req.body.branchId) {
      const validBranch = await Branch.findOne({ _id: req.body.branchId, organizationId: orgId }).session(session);
      if (!validBranch) throw new AppError("Invalid Branch ID.", 400);
    }

    if (!req.body.password) {
      req.body.password = "Employee@123";
      req.body.passwordConfirm = "Employee@123";
    }

    if (req.body.emailVerified === undefined) req.body.emailVerified = false;

    const [newUser] = await User.create([req.body], { session });

    await LeaveBalance.create([{
      user: newUser._id,
      organizationId: orgId,
      financialYear: getFinancialYear(),
      casualLeave: { total: 12, used: 0 },
      sickLeave: { total: 10, used: 0 },
      earnedLeave: { total: 0, used: 0 }
    }], { session });

    await session.commitTransaction();

    newUser.password = undefined;
    newUser.refreshTokens = undefined;

    res.status(201).json({
      status: 'success',
      data: {
        user: newUser,
        message: 'User created successfully with leave balance initialized.'
      }
    });
  } catch (error) {
    await session.abortTransaction();
    if (error.code === 11000) {
      const field = error.keyPattern?.email ? 'Email'
        : error.keyPattern?.phone ? 'Phone'
          : error.keyPattern?.['employeeProfile.employeeId'] ? 'Employee ID'
            : 'Field';
      return next(new AppError(`${field} already exists in this organization.`, 400));
    }
    return next(error);
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Update user
 * @route   PATCH /api/v1/users/:id
 * @access  Private (Admin/HR)
 */
exports.updateUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError("User not found", 404));

  validateUserAction(req.user, targetUser);

  // ✅ FIXED: Added permissionOverrides — must go through dedicated endpoint
  const forbiddenFields = [
    "password", "passwordConfirm", "organizationId", "createdBy",
    "isOwner", "refreshTokens", "loginAttempts", "lockUntil",
    "permissionOverrides", "isSuperAdmin"
  ];
  forbiddenFields.forEach(f => delete req.body[f]);

  if (req.body.phone) {
    if (!validatePhone(req.body.phone)) {
      return next(new AppError("Please provide a valid primary phone number", 400));
    }
    req.body.phone = cleanPhone(req.body.phone);
  }

  const updatePayload = { ...req.body, updatedBy: req.user._id };

  const flattenObject = (obj, prefix) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    Object.keys(obj).forEach(key => {
      if (obj[key] !== undefined) {
        updatePayload[`${prefix}.${key}`] = obj[key];
      }
    });
    delete updatePayload[prefix];
  };

  if (req.body.employeeProfile) flattenObject(req.body.employeeProfile, 'employeeProfile');
  if (req.body.attendanceConfig) flattenObject(req.body.attendanceConfig, 'attendanceConfig');
  if (req.body.preferences) flattenObject(req.body.preferences, 'preferences');

  // Validate reference IDs (org-bound)
  if (updatePayload['employeeProfile.reportingManagerId']) {
    const exists = await User.exists({
      _id: updatePayload['employeeProfile.reportingManagerId'],
      organizationId: req.user.organizationId
    });
    if (!exists) return next(new AppError("Reporting Manager not found.", 400));
  }

  if (updatePayload['employeeProfile.departmentId']) {
    const exists = await Department.exists({
      _id: updatePayload['employeeProfile.departmentId'],
      organizationId: req.user.organizationId
    });
    if (!exists) return next(new AppError("Department not found.", 400));
  }

  if (updatePayload['employeeProfile.designationId']) {
    const exists = await Designation.exists({
      _id: updatePayload['employeeProfile.designationId'],
      organizationId: req.user.organizationId
    });
    if (!exists) return next(new AppError("Designation not found.", 400));
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.params.id,
    { $set: updatePayload },
    { new: true, runValidators: true }
  )
    .populate("role", "name permissions isSuperAdmin")
    .populate("employeeProfile.designationId", "title")
    .populate("employeeProfile.departmentId", "name")
    .populate("attendanceConfig.shiftId", "name startTime endTime")
    .select("-password -refreshTokens -loginAttempts -lockUntil -permissionOverrides");

  // ✅ Emit to user's socket room so they re-fetch permissions/role
  const io = req.app.get('io');
  if (io) {
    const roomId = `user:${String(req.params.id)}`;

    // 💡 DIAGNOSTIC: Check if anyone is actually in this room
    const room = io.sockets.adapter.rooms.get(roomId);
    const memberCount = room ? room.size : 0;

    console.log(`[SOCKET DEBUG] Emitting update from updateUser to room ${roomId} (${memberCount} active members)`);

    io.to(roomId).emit('permissions:updated', {
      type: 'role_assigned',
      userId: String(req.params.id),
      timestamp: new Date().toISOString()
    });
  } else {
    console.warn('[SOCKET DEBUG] Socket.io not found on app instance during updateUser');
  }

  res.status(200).json({
    status: "success",
    data: { user: updatedUser }
  });
});

/**
 * @desc    Delete user (soft delete)
 * @route   DELETE /api/v1/users/:id
 * @access  Private (Admin only)
 */
exports.deleteUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError("User not found", 404));

  validateUserAction(req.user, targetUser);

  const activeSessions = await Session.countDocuments({ userId: targetUser._id, isValid: true });

  targetUser.isActive = false;
  targetUser.status = 'inactive';
  targetUser.isLoginBlocked = true;
  targetUser.blockReason = 'User deleted by administrator';
  targetUser.blockedAt = new Date();
  targetUser.blockedBy = req.user._id;
  targetUser.updatedBy = req.user._id;

  await targetUser.save({ validateBeforeSave: false });

  if (activeSessions > 0) {
    await Session.updateMany(
      { userId: targetUser._id, isValid: true },
      { isValid: false, terminatedAt: new Date() }
    );
  }

  // Force disconnect via socket if online
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${targetUser._id}`).emit('forceLogout', {
      reason: 'account_deleted',
      timestamp: new Date().toISOString()
    });
  }

  res.status(204).json({ status: "success", data: null });
});

/**
 * @desc    Admin update user password
 * @route   PATCH /api/v1/users/:id/password
 * @access  Private (Admin only)
 */
exports.adminUpdatePassword = catchAsync(async (req, res, next) => {
  const { password, passwordConfirm } = req.body;

  if (!password || !passwordConfirm) {
    return next(new AppError("Please provide password and passwordConfirm", 400));
  }

  if (password !== passwordConfirm) {
    return next(new AppError("Passwords do not match", 400));
  }

  if (password.length < 8) {
    return next(new AppError("Password must be at least 8 characters long", 400));
  }

  const targetUser = await User.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  }).select("+password");

  if (!targetUser) return next(new AppError("User not found", 404));

  validateUserAction(req.user, targetUser);

  targetUser.password = password;
  targetUser.passwordConfirm = passwordConfirm;
  targetUser.passwordChangedAt = Date.now() - 1000;
  targetUser.updatedBy = req.user._id;

  await targetUser.save();

  await Session.updateMany(
    { userId: targetUser._id, isValid: true },
    { isValid: false, terminatedAt: new Date() }
  );

  res.status(200).json({
    status: "success",
    message: "Password updated successfully. User will need to login again."
  });
});

/**
 * @desc    Upload user photo by admin
 * @route   PATCH /api/v1/users/:id/photo
 * @access  Private (Admin/HR)
 */
exports.uploadUserPhotoByAdmin = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return next(new AppError("User not found.", 404));

  validateUserAction(req.user, targetUser);

  if (!req.file || !req.file.buffer) {
    return next(new AppError("Please upload an image file.", 400));
  }

  if (targetUser.avatarAsset) {
    try {
      await imageUploadService.deleteFullAsset(targetUser.avatarAsset, targetUser.organizationId);
    } catch (err) {
      console.warn(`⚠️ Old avatar cleanup skipped for user ${targetUser._id}:`, err.message);
    }
  }

  const asset = await imageUploadService.uploadAndRecord(req.file, req.user, 'avatar');

  const updatedUser = await User.findByIdAndUpdate(
    targetUser._id,
    { avatar: asset.url, avatarAsset: asset._id, updatedBy: req.user._id },
    { new: true, runValidators: true }
  ).select("-password -refreshTokens -loginAttempts -lockUntil -permissionOverrides");

  res.status(200).json({
    status: "success",
    message: "User photo updated successfully by Admin.",
    data: { user: updatedUser, asset }
  });
});

// ======================================================
//  4. STATUS & PERMISSION CONTROL
// ======================================================

/**
 * @desc    Toggle user block status (Kill Switch)
 * @route   POST /api/v1/users/toggle-block
 * @access  Private (Admin only)
 */
exports.toggleUserBlock = catchAsync(async (req, res, next) => {
  const { userId, blockStatus, reason } = req.body;

  if (!userId || blockStatus === undefined) {
    return next(new AppError("Please provide userId and blockStatus", 400));
  }

  const targetUser = await User.findById(userId).populate('role');
  if (!targetUser) return next(new AppError('User not found', 404));

  validateUserAction(req.user, targetUser);

  targetUser.isLoginBlocked = blockStatus;
  targetUser.updatedBy = req.user._id;

  if (blockStatus) {
    targetUser.blockReason = reason || 'Blocked by administrator';
    targetUser.blockedAt = new Date();
    targetUser.blockedBy = req.user._id;

    await Session.updateMany(
      { userId: targetUser._id, isValid: true },
      { isValid: false, terminatedAt: new Date() }
    );

    // Force disconnect via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('forceLogout', {
        reason: 'account_blocked',
        timestamp: new Date().toISOString()
      });
    }
  } else {
    targetUser.blockReason = undefined;
    targetUser.blockedAt = undefined;
    targetUser.blockedBy = undefined;
  }

  await targetUser.save({ validateBeforeSave: false });

  // ✅ Emit refresh signal to user's room (especially useful for unblocking)
  const io = req.app.get('io');
  if (io && !blockStatus) {
    console.log(`[SOCKET DEBUG] Emitting unblock refresh to room user:${userId}`);
    io.to(`user:${String(userId)}`).emit('permissions:updated', {
      type: 'status_change',
      userId: String(userId),
      status: 'active',
      timestamp: new Date().toISOString()
    });
  }

  res.status(200).json({
    status: 'success',
    message: blockStatus ? 'User has been blocked successfully.' : 'User has been unblocked.',
    data: {
      id: targetUser._id,
      isLoginBlocked: targetUser.isLoginBlocked,
      reason: targetUser.blockReason
    }
  });
});

/**
 * @desc    Activate user
 * @route   PATCH /api/v1/users/:id/activate
 * @access  Private (Admin only)
 */
exports.activateUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError("User not found", 404));

  validateUserAction(req.user, targetUser);

  targetUser.status = "approved";
  targetUser.isActive = true;
  targetUser.isLoginBlocked = false;
  targetUser.blockReason = undefined;
  targetUser.blockedAt = undefined;
  targetUser.blockedBy = undefined;
  targetUser.updatedBy = req.user._id;

  await targetUser.save({ validateBeforeSave: false });

  // ✅ Emit refresh signal
  const io = req.app.get('io');
  if (io) {
    console.log(`[SOCKET DEBUG] Emitting activation refresh to room user:${req.params.id}`);
    io.to(`user:${String(req.params.id)}`).emit('permissions:updated', {
      type: 'status_change',
      userId: String(req.params.id),
      status: 'active',
      timestamp: new Date().toISOString()
    });
  }

  res.status(200).json({
    status: "success",
    message: "User activated successfully",
    data: { user: targetUser }
  });
});

/**
 * @desc    Deactivate user
 * @route   PATCH /api/v1/users/:id/deactivate
 * @access  Private (Admin only)
 */
exports.deactivateUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError("User not found", 404));

  validateUserAction(req.user, targetUser);

  targetUser.status = "inactive";
  targetUser.isActive = false;
  targetUser.updatedBy = req.user._id;

  await targetUser.save({ validateBeforeSave: false });

  await Session.updateMany(
    { userId: targetUser._id, isValid: true },
    { isValid: false, terminatedAt: new Date() }
  );

  // ✅ Emit refresh signal (just in case they haven't been disconnected yet)
  const io = req.app.get('io');
  if (io) {
    console.log(`[SOCKET DEBUG] Emitting deactivation refresh to room user:${req.params.id}`);
    io.to(`user:${String(req.params.id)}`).emit('permissions:updated', {
      type: 'status_change',
      userId: String(req.params.id),
      status: 'inactive',
      timestamp: new Date().toISOString()
    });
  }

  res.status(200).json({
    status: "success",
    message: "User deactivated successfully",
    data: { user: targetUser }
  });
});

/**
 * @desc    Check if user has a specific permission (accounts for overrides)
 * @route   POST /api/v1/users/check-permission
 * @access  Private
 */
exports.checkPermission = catchAsync(async (req, res, next) => {
  const { permission } = req.body;

  if (!permission) {
    return next(new AppError("Please provide permission to check", 400));
  }

  // ✅ FIXED: select permissionOverrides + use mergePermissions helper
  const user = await User.findById(req.user._id)
    .populate("role", "name permissions isSuperAdmin")
    .select('role permissionOverrides isOwner')
    .lean();

  const org = await Organization.findById(req.user.organizationId).select('owner').lean();
  const isOwner = org?.owner?.toString() === req.user._id.toString();

  let hasPermission = false;

  if (isOwner || user.role?.isSuperAdmin) {
    hasPermission = true;
  } else {
    const effective = new Set(mergePermissions(user.role?.permissions, user.permissionOverrides));
    hasPermission = effective.has(permission) || effective.has('*');
  }

  res.status(200).json({
    status: "success",
    data: { hasPermission, permission, role: user.role?.name }
  });
});

/**
 * @desc    Bulk update user status
 * @route   POST /api/v1/users/bulk-status
 * @access  Private (Admin only)
 */
exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
  const { userIds, status, reason } = req.body;

  if (!userIds || !userIds.length || !status) {
    return next(new AppError("Please provide user IDs and status", 400));
  }

  const validStatuses = ['approved', 'rejected', 'inactive', 'suspended'];
  if (!validStatuses.includes(status)) {
    return next(new AppError("Invalid status", 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await User.updateMany(
      {
        _id: { $in: userIds },
        organizationId: req.user.organizationId,
        isOwner: { $ne: true }
      },
      {
        $set: {
          status,
          updatedBy: req.user._id,
          ...(status === 'suspended' && {
            isLoginBlocked: true,
            blockReason: reason || 'Bulk status update',
            blockedAt: new Date(),
            blockedBy: req.user._id
          })
        }
      },
      { session }
    );

    if (status === 'suspended' || status === 'inactive') {
      await Session.updateMany(
        { userId: { $in: userIds }, isValid: true },
        { isValid: false, terminatedAt: new Date() },
        { session }
      );

      // Force disconnect all affected users via socket
      const io = req.app.get('io');
      if (io) {
        userIds.forEach(uid => {
          io.to(`user:${uid}`).emit('forceLogout', {
            reason: status === 'suspended' ? 'account_suspended' : 'account_deactivated',
            timestamp: new Date().toISOString()
          });
        });
      }
    }

    await session.commitTransaction();

    res.status(200).json({
      status: 'success',
      data: { matched: result.matchedCount, modified: result.modifiedCount }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ======================================================
//  5. EXPORT & REPORTING
// ======================================================

/**
 * @desc    Export users data
 * @route   GET /api/v1/users/export
 * @access  Private (Admin/HR)
 */
exports.exportUsers = catchAsync(async (req, res, next) => {
  const { format = 'json', departmentId } = req.query;

  const query = {
    organizationId: req.user.organizationId,
    isActive: req.query.isActive !== 'false'
  };

  if (departmentId) {
    query['employeeProfile.departmentId'] = departmentId;
  }

  // ✅ FIXED: Exclude sensitive fields from export
  const users = await User.find(query)
    .select('-permissionOverrides -loginAttempts -lockUntil -refreshTokens -passwordResetToken -emailVerificationToken -password')
    .populate('role', 'name')
    .populate('employeeProfile.departmentId', 'name')
    .populate('employeeProfile.designationId', 'title')
    .populate('employeeProfile.reportingManagerId', 'name')
    .lean();

  if (format === 'csv') {
    const csvData = users.map(u => ({
      'Employee ID': u.employeeProfile?.employeeId,
      'Name': u.name,
      'Email': u.email,
      'Phone': u.phone,
      'Department': u.employeeProfile?.departmentId?.name,
      'Designation': u.employeeProfile?.designationId?.title,
      'Status': u.status,
      'Joined': u.employeeProfile?.dateOfJoining,
      'Employment Type': u.employeeProfile?.employmentType
    }));

    return res.status(200).json({ status: 'success', data: csvData });
  }

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { users }
  });
});

module.exports = exports;

























// 'use strict';

// const mongoose = require('mongoose');
// const User = require("./user.model");
// const Organization = require("../../organization/core/organization.model");
// const ActivityLog = require("../../activity/activityLogModel");
// const LeaveBalance = require("../../HRMS/models/leaveBalance.model");
// const Shift = require("../../HRMS/models/shift.model");
// const Department = require("../../HRMS/models/department.model");
// const Designation = require("../../HRMS/models/designation.model");
// const Branch = require("../../organization/core/branch.model");
// const Session = require("./session.model");

// const catchAsync = require("../../../core/utils/api/catchAsync");
// const AppError = require("../../../core/utils/api/appError");
// const factory = require("../../../core/utils/api/handlerFactory");
// const imageUploadService = require("../../uploads/imageUploadService");

// // ======================================================
// //  INTERNAL HELPERS
// // ======================================================

// const getFinancialYear = () => {
//   const now = new Date();
//   const year = now.getFullYear();
//   return now.getMonth() >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
// };

// // modules/auth/core/user.controller.ts or .js
// const { PERMISSIONS_LIST, getPermissionGroups } = require('../../../config/permissions');
// exports.getAllAvailablePermissions = (req, res) => {
//   res.status(200).json({
//     status: 'success',
//     results: PERMISSIONS_LIST.length,
//     data: {
//       groups: getPermissionGroups(), // ['System', 'Finance', 'HR', etc.]
//       permissions: PERMISSIONS_LIST
//     }
//   });
// };
// /**
//  * 🛡️ SECURITY: Hierarchy & Tenant Guard
//  */
// const validateUserAction = (actor, target) => {
//   // 1. Cross-tenant protection
//   if (target.organizationId.toString() !== actor.organizationId.toString()) {
//     throw new AppError("Access denied: User belongs to a different organization.", 403);
//   }

//   // 2. Owner protection
//   if (target.isOwner && actor._id.toString() !== target._id.toString()) {
//     throw new AppError("The Organization Owner cannot be modified or deleted by other users.", 403);
//   }

//   // 3. SuperAdmin Protection
//   const actorIsSuper = actor.role?.isSuperAdmin || actor.isSuperAdmin;
//   const targetIsSuper = target.role?.isSuperAdmin || target.isSuperAdmin;

//   if (targetIsSuper && !actorIsSuper) {
//     throw new AppError("You do not have permission to modify a Super Administrator.", 403);
//   }
// };

// /**
//  * Validate phone number format
//  */
// const validatePhone = (phone) => {
//   const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/;
//   return phoneRegex.test(phone);
// };

// /**
//  * Clean phone number for storage
//  */
// const cleanPhone = (phone) => {
//   return phone.replace(/[\s\-\(\)\+]/g, '');
// };

// // ======================================================
// //  1. SELF MANAGEMENT (Logged in user)
// // ======================================================

// /**
//  * @desc    Get my profile
//  * @route   GET /api/v1/users/me
//  * @access  Private
//  */
// exports.getMyProfile = [
//   catchAsync(async (req, res, next) => {
//     req.params.id = req.user.id;
//     next();
//   }),
//   factory.getOne(User, {
//     populate: [
//       { path: "role", select: "name permissions isSuperAdmin" },
//       { path: "branchId", select: "name address phone" },
//       { path: "employeeProfile.departmentId", select: "name" },
//       { path: "employeeProfile.designationId", select: "title" },
//       { path: "employeeProfile.reportingManagerId", select: "name avatar" },
//       { path: "attendanceConfig.shiftId", select: "name startTime endTime" },
//       { path: "attendanceConfig.shiftGroupId", select: "name" },
//       { path: "attendanceConfig.geoFenceId", select: "name" }
//     ],
//   }),
// ];

// /**
//  * @desc    Update my profile
//  * @route   PATCH /api/v1/users/me
//  * @access  Private
//  */
// exports.updateMyProfile = catchAsync(async (req, res, next) => {
//   // 🟢 SECURITY: Prevent privilege escalation
//   const restrictedFields = [
//     "password", "passwordConfirm", "role", "isOwner", "organizationId",
//     "isActive", "status", "email", "phone", "employeeProfile.employeeId",
//     "isLoginBlocked", "loginAttempts", "lockUntil", "refreshTokens"
//   ];

//   restrictedFields.forEach(field => {
//     if (req.body[field] !== undefined) delete req.body[field];
//   });

//   // 🟢 ALLOWED: Fields user can update
//   const allowedFields = [
//     "name", "avatar", "language", "themeId", "upiId",
//     "preferences.theme", "preferences.notifications",
//     "employeeProfile.secondaryPhone", "employeeProfile.guarantorDetails"
//   ];

//   const filteredBody = {};

//   // Handle nested updates
//   Object.keys(req.body).forEach((key) => {
//     if (allowedFields.includes(key) || key.startsWith('preferences.') || key.startsWith('employeeProfile.')) {
//       filteredBody[key] = req.body[key];
//     }
//   });

//   // Validate phone if provided
//   if (filteredBody.employeeProfile?.secondaryPhone) {
//     if (!validatePhone(filteredBody.employeeProfile.secondaryPhone)) {
//       return next(new AppError("Please provide a valid secondary phone number", 400));
//     }
//     filteredBody.employeeProfile.secondaryPhone = cleanPhone(filteredBody.employeeProfile.secondaryPhone);
//   }

//   const updatedUser = await User.findByIdAndUpdate(
//     req.user.id,
//     { $set: filteredBody },
//     { new: true, runValidators: true }
//   ).populate("role", "name");

//   res.status(200).json({
//     status: "success",
//     data: { user: updatedUser }
//   });
// });

// /**
//  * @desc    Upload profile photo (Integrated with Master Asset System)
//  * @route   POST /api/v1/users/me/photo
//  * @access  Private
//  */
// exports.uploadProfilePhoto = catchAsync(async (req, res, next) => {
//   if (!req.file || !req.file.buffer) {
//     return next(new AppError("Please upload an image file.", 400));
//   }
//   const currentUser = await User.findById(req.user.id);
//   if (currentUser.avatarAsset) {
//     try {
//       await imageUploadService.deleteFullAsset(currentUser.avatarAsset, req.user.organizationId);
//     } catch (err) {
//       console.warn("⚠️ Note: Old avatar cleanup skipped or failed:", err.message);
//     }
//   }
//   const asset = await imageUploadService.uploadAndRecord(req.file, req.user, 'avatar');
//   const updatedUser = await User.findByIdAndUpdate(
//     req.user.id,
//     {
//       avatar: asset.url,
//       avatarAsset: asset._id
//     },
//     { new: true, runValidators: true }
//   ).select("-password -refreshTokens -loginAttempts -lockUntil");

//   res.status(200).json({
//     status: "success",
//     message: "Profile photo updated successfully.",
//     data: {
//       user: updatedUser,
//       asset // Returning asset details in case the frontend needs the size/format
//     },
//   });
// });

// // /**
// //  * @desc    Get my permissions
// //  * @route   GET /api/v1/users/me/permissions
// //  * @access  Private
// //  */
// // exports.getMyPermissions = catchAsync(async (req, res) => {
// //   const user = await User.findById(req.user._id).populate({
// //     path: "role",
// //     select: "name permissions isSuperAdmin",
// //   });

// //   const org = await Organization.findById(req.user.organizationId).select('owner').lean();
// //   const isOwner = org?.owner?.toString() === req.user._id.toString();

// //   const permissions = isOwner ? ["*"] : user.role?.permissions || [];

// //   res.status(200).json({
// //     status: "success",
// //     data: {
// //       permissions,
// //       role: user.role?.name,
// //       isOwner,
// //       isSuperAdmin: isOwner ? true : user.role?.isSuperAdmin || false,
// //       organizationId: req.user.organizationId,
// //       emailVerified: user.emailVerified,
// //       status: user.status
// //     },
// //   });
// // });
// /**
//  * @desc    Get my effective permissions (role + overrides merged)
//  * @route   GET /api/v1/users/me/permissions
//  * @access  Private
//  */
// exports.getMyPermissions = catchAsync(async (req, res) => {
//   const user = await User.findById(req.user._id)
//     .populate('role', 'name permissions isSuperAdmin')
//     .select('role permissionOverrides isSuperAdmin isOwner')
//     .lean();

//   const org = await Organization.findById(req.user.organizationId)
//     .select('owner')
//     .lean();

//   const isOwner = org?.owner?.toString() === req.user._id.toString();

//   // Owner / superadmin → full access
//   if (isOwner || user.role?.isSuperAdmin) {
//     return res.status(200).json({
//       status: 'success',
//       data: {
//         permissions: VALID_TAGS,
//         role: user.role?.name,
//         isOwner,
//         isSuperAdmin: true,
//         overrides: { granted: [], revoked: [] }
//       }
//     });
//   }

//   const base    = new Set(user.role?.permissions ?? []);
//   const granted = user.permissionOverrides?.granted ?? [];
//   const revoked = new Set(user.permissionOverrides?.revoked ?? []);

//   granted.forEach(p => base.add(p));
//   revoked.forEach(p => base.delete(p));

//   res.status(200).json({
//     status: 'success',
//     data: {
//       permissions: [...base],
//       role: user.role?.name,
//       isOwner: false,
//       isSuperAdmin: false,
//       overrides: {
//         granted: user.permissionOverrides?.granted ?? [],
//         revoked: user.permissionOverrides?.revoked ?? []
//       }
//     }
//   });
// });

// /**
//  * @desc    Update per-user permission overrides
//  * @route   PATCH /api/v1/users/:id/permission-overrides
//  * @access  Private (Admin/Owner only)
//  */
// exports.updatePermissionOverrides = catchAsync(async (req, res, next) => {
//   const orgId  = req.user.organizationId;
//   const userId = req.params.id;
//   const { grant = [], revoke = [] } = req.body;

//   // Validate all tags exist
//   const allTags = [...grant, ...revoke];
//   const invalid = allTags.filter(p => !VALID_TAGS.includes(p));
//   if (invalid.length) {
//     return next(new AppError(`Invalid permissions: ${invalid.join(', ')}`, 400));
//   }

//   // Can't grant AND revoke the same tag simultaneously
//   const conflict = grant.filter(p => revoke.includes(p));
//   if (conflict.length) {
//     return next(new AppError(`Cannot grant and revoke same permission: ${conflict.join(', ')}`, 400));
//   }

//   const target = await User.findOne({ _id: userId, organizationId: orgId }).populate('role');
//   if (!target) return next(new AppError('User not found', 404));

//   validateUserAction(req.user, target);

//   // Only owners can grant system-level permissions
//   const sensitiveGroups = ['System', 'Organization', 'Platform'];
//   const sensitiveTags = PERMISSIONS_LIST
//     .filter(p => sensitiveGroups.includes(p.group))
//     .map(p => p.tag);

//   if (!req.user.isOwner && grant.some(p => sensitiveTags.includes(p))) {
//     return next(new AppError('Only owners can grant system-level permissions', 403));
//   }

//   target.permissionOverrides = { granted: grant, revoked: revoke };
//   target.updatedBy = req.user._id;
//   await target.save({ validateBeforeSave: false });

//   // Notify only this specific user via their socket room
//   const io = req.app.get('io');
//   if (io) {
//     console.log(`[SOCKET DEBUG] Emitting override update to room user:${userId}`);
//     io.to(`user:${userId}`).emit('permissions:updated', {
//       type: 'override',
//       userId,
//       timestamp: new Date().toISOString()
//     });
//   }

//   res.status(200).json({
//     status: 'success',
//     message: 'Permission overrides updated',
//     data: {
//       userId,
//       overrides: target.permissionOverrides
//     }
//   });
// });

// /**
//  * @desc    Get my devices/sessions
//  * @route   GET /api/v1/users/me/devices
//  * @access  Private
//  */
// exports.getMyDevices = catchAsync(async (req, res) => {
//   const sessions = await Session.find({
//     userId: req.user._id,
//     isValid: true
//   })
//     .select('-token -refreshToken')
//     .sort('-lastActivityAt');

//   const currentSessionId = req.session?._id;

//   res.status(200).json({
//     status: "success",
//     results: sessions.length,
//     data: {
//       currentSessionId,
//       devices: sessions
//     }
//   });
// });

// /**
//  * @desc    Revoke a device session
//  * @route   DELETE /api/v1/users/me/devices/:sessionId
//  * @access  Private
//  */
// exports.revokeDevice = catchAsync(async (req, res, next) => {
//   const { sessionId } = req.params;

//   const session = await Session.findOne({
//     _id: sessionId,
//     userId: req.user._id,
//     isValid: true
//   });

//   if (!session) {
//     return next(new AppError("Session not found or already expired", 404));
//   }

//   // Don't allow revoking current session
//   if (req.session?._id && req.session._id.toString() === sessionId) {
//     return next(new AppError("Cannot revoke current session. Use logout instead.", 400));
//   }

//   session.isValid = false;
//   session.terminatedAt = new Date();
//   await session.save();

//   res.status(200).json({
//     status: "success",
//     message: "Device session revoked successfully"
//   });
// });

// // ======================================================
// //  2. USER MANAGEMENT (Admin/HR) - READ OPERATIONS
// // ======================================================

// /**
//  * @desc    Get all users
//  * @route   GET /api/v1/users
//  * @access  Private (Admin/HR)
//  */
// exports.getAllUsers = catchAsync(async (req, res, next) => {
//   // 🟢 SECURITY: Force strict tenant isolation
//   req.query.organizationId = req.user.organizationId;

//   // Custom Filters for nested fields
//   if (req.query.department) {
//     const dept = await Department.findOne({
//       name: req.query.department,
//       organizationId: req.user.organizationId
//     });
//     if (dept) req.query['employeeProfile.departmentId'] = dept._id;
//   }

//   if (req.query.designation) {
//     const desig = await Designation.findOne({
//       title: req.query.designation,
//       organizationId: req.user.organizationId
//     });
//     if (desig) req.query['employeeProfile.designationId'] = desig._id;
//   }

//   if (req.query.reportingTo) {
//     req.query['employeeProfile.reportingManagerId'] = req.query.reportingTo;
//   }

//   // Filter by employment type
//   if (req.query.employmentType) {
//     req.query['employeeProfile.employmentType'] = req.query.employmentType;
//   }

//   return factory.getAll(User, {
//     searchFields: ["name", "email", "phone", "employeeProfile.employeeId", "employeeProfile.secondaryPhone"],
//     populate: [
//       { path: "role", select: "name" },
//       { path: "branchId", select: "name" },
//       { path: "employeeProfile.departmentId", select: "name" },
//       { path: "employeeProfile.designationId", select: "title" },
//       { path: "employeeProfile.reportingManagerId", select: "name" },
//       { path: "attendanceConfig.shiftId", select: "name" }
//     ],
//   })(req, res, next);
// });

// /**
//  * @desc    Get user by ID
//  * @route   GET /api/v1/users/:id
//  * @access  Private (Admin/HR)
//  */
// exports.getUser = factory.getOne(User, {
//   populate: [
//     { path: "role", select: "name permissions isSuperAdmin" },
//     { path: "branchId", select: "name address city" },
//     { path: "employeeProfile.designationId", select: "title" },
//     { path: "employeeProfile.departmentId", select: "name" },
//     { path: "employeeProfile.reportingManagerId", select: "name avatar" },
//     { path: "attendanceConfig.shiftId", select: "name startTime endTime" },
//     { path: "attendanceConfig.shiftGroupId", select: "name" },
//     { path: "attendanceConfig.geoFenceId", select: "name" },
//     { path: "createdBy", select: "name" },
//     { path: "updatedBy", select: "name" },
//     { path: "blockedBy", select: "name" }
//   ],
// });

// /**
//  * @desc    Search users
//  * @route   GET /api/v1/users/search
//  * @access  Private
//  */
// exports.searchUsers = (req, res, next) => {
//   if (req.query.q) req.query.search = req.query.q;
//   req.query.organizationId = req.user.organizationId;

//   factory.getAll(User, {
//     searchFields: ["name", "email", "phone", "employeeProfile.employeeId"],
//     populate: [
//       { path: "role", select: "name" },
//       { path: "branchId", select: "name" }
//     ],
//   })(req, res, next);
// };

// /**
//  * @desc    Get user activity logs
//  * @route   GET /api/v1/users/:id/activity
//  * @access  Private (Admin/HR)
//  */
// exports.getUserActivity = catchAsync(async (req, res, next) => {
//   const userId = req.params.id;
//   const org = req.user.organizationId;

//   const targetExists = await User.exists({ _id: userId, organizationId: org });
//   if (!targetExists) {
//     return next(new AppError("User activity not found or access denied.", 404));
//   }

//   const [activities, sessions] = await Promise.all([
//     ActivityLog.find({
//       organizationId: org,
//       $or: [{ userId: userId }, { user: userId }],
//     })
//       .sort({ createdAt: -1 })
//       .limit(100)
//       .lean(),

//     Session.find({
//       userId: userId,
//       organizationId: org
//     })
//       .select('-token -refreshToken')
//       .sort('-createdAt')
//       .limit(50)
//       .lean()
//   ]);

//   res.status(200).json({
//     status: "success",
//     data: {
//       activities,
//       sessions,
//       totalActivities: activities.length,
//       totalSessions: sessions.length
//     },
//   });
// });

// /**
//  * @desc    Get organization hierarchy (reporting structure)
//  * @route   GET /api/v1/users/hierarchy
//  * @access  Private
//  */
// exports.getOrgHierarchy = catchAsync(async (req, res, next) => {
//   const users = await User.find({
//     organizationId: req.user.organizationId,
//     isActive: true,
//     status: 'approved'
//   })
//     .select('name avatar email employeeProfile.designationId employeeProfile.departmentId employeeProfile.reportingManagerId')
//     .populate('employeeProfile.designationId', 'title level')
//     .populate('employeeProfile.departmentId', 'name')
//     .lean();

//   // Build reporting tree
//   const userMap = {};
//   const roots = [];

//   // First pass: create map
//   users.forEach(user => {
//     userMap[user._id] = {
//       ...user,
//       children: [],
//       reportees: []
//     };
//   });

//   // Second pass: build hierarchy
//   users.forEach(user => {
//     if (user.employeeProfile?.reportingManagerId) {
//       const managerId = user.employeeProfile.reportingManagerId.toString();
//       if (userMap[managerId]) {
//         userMap[managerId].reportees.push(userMap[user._id]);
//       } else {
//         roots.push(userMap[user._id]);
//       }
//     } else {
//       roots.push(userMap[user._id]);
//     }
//   });

//   res.status(200).json({
//     status: 'success',
//     data: {
//       totalUsers: users.length,
//       hierarchy: roots
//     }
//   });
// });

// /**
//  * @desc    Get users by department
//  * @route   GET /api/v1/users/by-department/:departmentId
//  * @access  Private
//  */
// exports.getUsersByDepartment = catchAsync(async (req, res, next) => {
//   const { departmentId } = req.params;

//   const department = await Department.findOne({
//     _id: departmentId,
//     organizationId: req.user.organizationId
//   });

//   if (!department) {
//     return next(new AppError("Department not found", 404));
//   }

//   const users = await User.find({
//     organizationId: req.user.organizationId,
//     'employeeProfile.departmentId': departmentId,
//     isActive: true
//   })
//     .select('name email phone avatar employeeProfile.designationId employeeProfile.employeeId')
//     .populate('employeeProfile.designationId', 'title')
//     .sort('name');

//   res.status(200).json({
//     status: 'success',
//     results: users.length,
//     data: { users }
//   });
// });

// // ======================================================
// //  3. USER MANAGEMENT (Admin/HR) - WRITE OPERATIONS
// // ======================================================

// /**
//  * @desc    Create new user (with leave balance)
//  * @route   POST /api/v1/users
//  * @access  Private (Admin/HR)
//  */
// exports.createUser = catchAsync(async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const orgId = req.user.organizationId;
//     req.body.organizationId = orgId;
//     req.body.createdBy = req.user._id;
//     req.body.updatedBy = req.user._id;

//     // --- Validation Section ---
//     const { employeeProfile, attendanceConfig, phone } = req.body;

//     // Validate phone
//     if (phone) {
//       if (!validatePhone(phone)) {
//         throw new AppError("Please provide a valid primary phone number", 400);
//       }
//       req.body.phone = cleanPhone(phone);
//     }

//     if (employeeProfile?.secondaryPhone) {
//       if (!validatePhone(employeeProfile.secondaryPhone)) {
//         throw new AppError("Please provide a valid secondary phone number", 400);
//       }
//       employeeProfile.secondaryPhone = cleanPhone(employeeProfile.secondaryPhone);
//     }

//     if (attendanceConfig?.shiftId) {
//       const validShift = await Shift.findOne({
//         _id: attendanceConfig.shiftId,
//         organizationId: orgId
//       }).session(session);
//       if (!validShift) throw new AppError("Invalid Shift ID.", 400);
//     }

//     if (employeeProfile?.departmentId) {
//       const validDept = await Department.findOne({
//         _id: employeeProfile.departmentId,
//         organizationId: orgId
//       }).session(session);
//       if (!validDept) throw new AppError("Invalid Department ID.", 400);
//     }

//     if (employeeProfile?.designationId) {
//       const validDesig = await Designation.findOne({
//         _id: employeeProfile.designationId,
//         organizationId: orgId
//       }).session(session);
//       if (!validDesig) throw new AppError("Invalid Designation ID.", 400);
//     }

//     if (req.body.branchId) {
//       const validBranch = await Branch.findOne({
//         _id: req.body.branchId,
//         organizationId: orgId
//       }).session(session);
//       if (!validBranch) throw new AppError("Invalid Branch ID.", 400);
//     }

//     // Default Password
//     if (!req.body.password) {
//       req.body.password = "Employee@123";
//       req.body.passwordConfirm = "Employee@123";
//     }

//     // Set default emailVerified if not provided
//     if (req.body.emailVerified === undefined) {
//       req.body.emailVerified = false;
//     }

//     // Create User
//     const [newUser] = await User.create([req.body], { session });

//     // Create Leave Balance
//     await LeaveBalance.create([{
//       user: newUser._id,
//       organizationId: orgId,
//       financialYear: getFinancialYear(),
//       casualLeave: { total: 12, used: 0 },
//       sickLeave: { total: 10, used: 0 },
//       earnedLeave: { total: 0, used: 0 }
//     }], { session });

//     await session.commitTransaction();
//     newUser.password = undefined;
//     newUser.refreshTokens = undefined;

//     res.status(201).json({
//       status: 'success',
//       data: {
//         user: newUser,
//         message: 'User created successfully with leave balance initialized.'
//       }
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     if (error.code === 11000) {
//       const field = error.keyPattern?.email ? 'Email' :
//         error.keyPattern?.phone ? 'Phone' :
//           error.keyPattern?.['employeeProfile.employeeId'] ? 'Employee ID' :
//             'Field';
//       return next(new AppError(`${field} already exists in this organization.`, 400));
//     }
//     return next(error);
//   } finally {
//     session.endSession();
//   }
// });

// /**
//  * @desc    Update user
//  * @route   PATCH /api/v1/users/:id
//  * @access  Private (Admin/HR)
//  */
// /**
//  * @desc    Update user
//  * @route   PATCH /api/v1/users/:id
//  * @access  Private (Admin/HR)
//  */
// exports.updateUser = catchAsync(async (req, res, next) => {
//   const targetUser = await User.findById(req.params.id).populate('role');
//   if (!targetUser) return next(new AppError("User not found", 404));

//   validateUserAction(req.user, targetUser);

//   // 1. Filter out restricted fields
//   const forbiddenFields = [
//     "password", "passwordConfirm", "organizationId", "createdBy",
//     "isOwner", "refreshTokens", "loginAttempts", "lockUntil"
//   ];
//   forbiddenFields.forEach(f => delete req.body[f]);

//   // 2. Validate phone if being updated
//   if (req.body.phone) {
//     if (!validatePhone(req.body.phone)) {
//       return next(new AppError("Please provide a valid primary phone number", 400));
//     }
//     req.body.phone = cleanPhone(req.body.phone);
//   }

//   // 3. Prepare Update Payload with Dot Notation for nested objects
//   const updatePayload = { ...req.body, updatedBy: req.user._id };

//   const flattenObject = (obj, prefix) => {
//     if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
//     Object.keys(obj).forEach(key => {
//       const val = obj[key];
//       // Only set if value is not undefined (null is allowed for clearing fields)
//       if (val !== undefined) {
//         updatePayload[`${prefix}.${key}`] = val;
//       }
//     });
//     // Remove the original object from payload so it doesn't overwrite the whole map
//     delete updatePayload[prefix];
//   };

//   if (req.body.employeeProfile) flattenObject(req.body.employeeProfile, 'employeeProfile');
//   if (req.body.attendanceConfig) flattenObject(req.body.attendanceConfig, 'attendanceConfig');
//   if (req.body.preferences) flattenObject(req.body.preferences, 'preferences');

//   // 4. Validate Reference IDs (Organization-bound check)
//   if (updatePayload['employeeProfile.reportingManagerId']) {
//     const managerExists = await User.exists({
//       _id: updatePayload['employeeProfile.reportingManagerId'],
//       organizationId: req.user.organizationId
//     });
//     if (!managerExists) return next(new AppError("Reporting Manager not found.", 400));
//   }

//   if (updatePayload['employeeProfile.departmentId']) {
//     const deptExists = await Department.exists({
//       _id: updatePayload['employeeProfile.departmentId'],
//       organizationId: req.user.organizationId
//     });
//     if (!deptExists) return next(new AppError("Department not found.", 400));
//   }

//   if (updatePayload['employeeProfile.designationId']) {
//     const desigExists = await Designation.exists({
//       _id: updatePayload['employeeProfile.designationId'],
//       organizationId: req.user.organizationId
//     });
//     if (!desigExists) return next(new AppError("Designation not found.", 400));
//   }

//   // 5. Execute Update and Populate Result
//   // 🛡️ CRITICAL: We MUST populate startTime and endTime.
//   // If we only select 'name', the duration virtual in Shift model will crash on .split(':')
//   const updatedUser = await User.findByIdAndUpdate(
//     req.params.id,
//     { $set: updatePayload },
//     { new: true, runValidators: true }
//   )
//     .populate("employeeProfile.designationId", "title")
//     .populate("employeeProfile.departmentId", "name")
//     .populate("attendanceConfig.shiftId", "name startTime endTime") // <--- FIXED: Added timing fields
//     .select("-password -refreshTokens -loginAttempts -lockUntil");

//   res.status(200).json({
//     status: "success",
//     data: { user: updatedUser }
//   });
// });

// /**
//  * @desc    Delete user (soft delete)
//  * @route   DELETE /api/v1/users/:id
//  * @access  Private (Admin only)
//  */
// exports.deleteUser = catchAsync(async (req, res, next) => {
//   const targetUser = await User.findById(req.params.id).populate('role');
//   if (!targetUser) return next(new AppError("User not found", 404));

//   validateUserAction(req.user, targetUser);

//   // Check if user has active sessions
//   const activeSessions = await Session.countDocuments({
//     userId: targetUser._id,
//     isValid: true
//   });

//   // Soft Delete
//   targetUser.isActive = false;
//   targetUser.status = 'inactive';
//   targetUser.isLoginBlocked = true;
//   targetUser.blockReason = 'User deleted by administrator';
//   targetUser.blockedAt = new Date();
//   targetUser.blockedBy = req.user._id;
//   targetUser.updatedBy = req.user._id;

//   await targetUser.save({ validateBeforeSave: false });

//   // Invalidate all sessions
//   if (activeSessions > 0) {
//     await Session.updateMany(
//       { userId: targetUser._id, isValid: true },
//       { isValid: false, terminatedAt: new Date() }
//     );
//   }

//   res.status(204).json({ status: "success", data: null });
// });

// /**
//  * @desc    Admin update user password
//  * @route   PATCH /api/v1/users/:id/password
//  * @access  Private (Admin only)
//  */
// exports.adminUpdatePassword = catchAsync(async (req, res, next) => {
//   const { password, passwordConfirm } = req.body;

//   if (password !== passwordConfirm) {
//     return next(new AppError("Passwords do not match", 400));
//   }

//   if (password.length < 8) {
//     return next(new AppError("Password must be at least 8 characters long", 400));
//   }

//   const targetUser = await User.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   }).select("+password");

//   if (!targetUser) return next(new AppError("User not found", 404));

//   validateUserAction(req.user, targetUser);

//   targetUser.password = password;
//   targetUser.passwordConfirm = passwordConfirm;
//   targetUser.passwordChangedAt = Date.now() - 1000;
//   targetUser.updatedBy = req.user._id;

//   await targetUser.save();

//   // Invalidate all existing sessions for security
//   await Session.updateMany(
//     { userId: targetUser._id, isValid: true },
//     { isValid: false, terminatedAt: new Date() }
//   );

//   res.status(200).json({
//     status: "success",
//     message: "Password updated successfully. User will need to login again."
//   });
// });


// /**
//  * @desc    Upload user photo by admin (Integrated with Asset System)
//  * @route   PATCH /api/v1/users/:id/photo
//  * @access  Private (Admin/HR)
//  */
// exports.uploadUserPhotoByAdmin = catchAsync(async (req, res, next) => {
//   const targetUser = await User.findById(req.params.id);
//   if (!targetUser) return next(new AppError("User not found.", 404));

//   // Check admin/HR permissions
//   validateUserAction(req.user, targetUser);

//   if (!req.file || !req.file.buffer) {
//     return next(new AppError("Please upload an image file.", 400));
//   }

//   // 1. CLEANUP: Prevent orphan files by deleting the user's old photo
//   if (targetUser.avatarAsset) {
//     try {
//       // Using targetUser.organizationId to ensure we delete from the correct org scope
//       await imageUploadService.deleteFullAsset(targetUser.avatarAsset, targetUser.organizationId);
//     } catch (err) {
//       console.warn(`⚠️ Warning: Old avatar cleanup skipped for user ${targetUser._id}:`, err.message);
//     }
//   }

//   // 2. UPLOAD & RECORD: Send to Cloudinary & DB
//   // Note: We pass req.user (the Admin) so the Asset record shows the Admin as the uploader
//   const asset = await imageUploadService.uploadAndRecord(req.file, req.user, 'avatar');

//   // 3. UPDATE TARGET USER: Link the new URL and Asset ID
//   const updatedUser = await User.findByIdAndUpdate(
//     targetUser._id,
//     {
//       avatar: asset.url,
//       avatarAsset: asset._id, // Keep the DB link tight
//       updatedBy: req.user._id
//     },
//     { new: true, runValidators: true }
//   ).select("-password -refreshTokens -loginAttempts -lockUntil");

//   res.status(200).json({
//     status: "success",
//     message: "User photo updated successfully by Admin.",
//     data: {
//       user: updatedUser,
//       asset
//     }
//   });
// });

// // ======================================================
// //  4. STATUS & PERMISSION CONTROL
// // ======================================================

// /**
//  * @desc    Toggle user block status (Kill Switch)
//  * @route   POST /api/v1/users/toggle-block
//  * @access  Private (Admin only)
//  */
// exports.toggleUserBlock = catchAsync(async (req, res, next) => {
//   const { userId, blockStatus, reason } = req.body;

//   if (!userId || blockStatus === undefined) {
//     return next(new AppError("Please provide userId and blockStatus", 400));
//   }

//   const targetUser = await User.findById(userId).populate('role');
//   if (!targetUser) return next(new AppError('User not found', 404));

//   validateUserAction(req.user, targetUser);

//   targetUser.isLoginBlocked = blockStatus;
//   targetUser.updatedBy = req.user._id;

//   if (blockStatus) {
//     targetUser.blockReason = reason || 'Blocked by administrator';
//     targetUser.blockedAt = new Date();
//     targetUser.blockedBy = req.user._id;

//     // Invalidate all sessions when blocking
//     await Session.updateMany(
//       { userId: targetUser._id, isValid: true },
//       { isValid: false, terminatedAt: new Date() }
//     );
//   } else {
//     targetUser.blockReason = undefined;
//     targetUser.blockedAt = undefined;
//     targetUser.blockedBy = undefined;
//   }

//   await targetUser.save({ validateBeforeSave: false });

//   res.status(200).json({
//     status: 'success',
//     message: blockStatus ? 'User has been blocked successfully.' : 'User has been unblocked.',
//     data: {
//       id: targetUser._id,
//       isLoginBlocked: targetUser.isLoginBlocked,
//       reason: targetUser.blockReason
//     }
//   });
// });

// /**
//  * @desc    Activate user
//  * @route   PATCH /api/v1/users/:id/activate
//  * @access  Private (Admin only)
//  */
// exports.activateUser = catchAsync(async (req, res, next) => {
//   const targetUser = await User.findById(req.params.id).populate('role');
//   if (!targetUser) return next(new AppError("User not found", 404));

//   validateUserAction(req.user, targetUser);

//   targetUser.status = "approved";
//   targetUser.isActive = true;
//   targetUser.isLoginBlocked = false; // Ensure not blocked
//   targetUser.blockReason = undefined;
//   targetUser.blockedAt = undefined;
//   targetUser.blockedBy = undefined;
//   targetUser.updatedBy = req.user._id;

//   await targetUser.save({ validateBeforeSave: false });

//   // Optional: Send activation email
//   // sendActivationEmail(targetUser);

//   res.status(200).json({
//     status: "success",
//     message: "User activated successfully",
//     data: { user: targetUser }
//   });
// });

// /**
//  * @desc    Deactivate user
//  * @route   PATCH /api/v1/users/:id/deactivate
//  * @access  Private (Admin only)
//  */
// exports.deactivateUser = catchAsync(async (req, res, next) => {
//   const targetUser = await User.findById(req.params.id).populate('role');
//   if (!targetUser) return next(new AppError("User not found", 404));

//   validateUserAction(req.user, targetUser);

//   targetUser.status = "inactive";
//   targetUser.isActive = false;
//   targetUser.updatedBy = req.user._id;

//   await targetUser.save({ validateBeforeSave: false });

//   // Invalidate all sessions
//   await Session.updateMany(
//     { userId: targetUser._id, isValid: true },
//     { isValid: false, terminatedAt: new Date() }
//   );

//   res.status(200).json({
//     status: "success",
//     message: "User deactivated successfully",
//     data: { user: targetUser }
//   });
// });

// /**
//  * @desc    Check if user has permission
//  * @route   POST /api/v1/users/check-permission
//  * @access  Private
//  */
// exports.checkPermission = catchAsync(async (req, res, next) => {
//   const { permission } = req.body;

//   if (!permission) {
//     return next(new AppError("Please provide permission to check", 400));
//   }

//   const user = await User.findById(req.user._id).populate("role");

//   const org = await Organization.findById(req.user.organizationId).select('owner').lean();
//   const isOwner = org?.owner?.toString() === req.user._id.toString();

//   const hasPermission = isOwner ||
//     user.role?.isSuperAdmin ||
//     user.role?.permissions?.includes(permission) ||
//     user.role?.permissions?.includes("*");

//   res.status(200).json({
//     status: "success",
//     data: {
//       hasPermission,
//       permission,
//       role: user.role?.name
//     }
//   });
// });

// /**
//  * @desc    Bulk update user status
//  * @route   POST /api/v1/users/bulk-status
//  * @access  Private (Admin only)
//  */
// exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
//   const { userIds, status, reason } = req.body;

//   if (!userIds || !userIds.length || !status) {
//     return next(new AppError("Please provide user IDs and status", 400));
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const validStatuses = ['approved', 'rejected', 'inactive', 'suspended'];
//     if (!validStatuses.includes(status)) {
//       throw new AppError("Invalid status", 400);
//     }

//     const result = await User.updateMany(
//       {
//         _id: { $in: userIds },
//         organizationId: req.user.organizationId,
//         isOwner: { $ne: true } // Don't update owners
//       },
//       {
//         $set: {
//           status,
//           updatedBy: req.user._id,
//           ...(status === 'suspended' && {
//             isLoginBlocked: true,
//             blockReason: reason || 'Bulk status update',
//             blockedAt: new Date(),
//             blockedBy: req.user._id
//           })
//         }
//       },
//       { session }
//     );

//     // If suspending, invalidate sessions
//     if (status === 'suspended' || status === 'inactive') {
//       await Session.updateMany(
//         { userId: { $in: userIds }, isValid: true },
//         { isValid: false, terminatedAt: new Date() },
//         { session }
//       );
//     }

//     await session.commitTransaction();

//     res.status(200).json({
//       status: 'success',
//       data: {
//         matched: result.matchedCount,
//         modified: result.modifiedCount
//       }
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// // ======================================================
// //  5. EXPORT & REPORTING
// // ======================================================

// /**
//  * @desc    Export users data
//  * @route   GET /api/v1/users/export
//  * @access  Private (Admin/HR)
//  */
// exports.exportUsers = catchAsync(async (req, res, next) => {
//   const { format = 'json', fields, departmentId } = req.query;

//   const query = {
//     organizationId: req.user.organizationId,
//     isActive: req.query.isActive !== 'false'
//   };

//   if (departmentId) {
//     query['employeeProfile.departmentId'] = departmentId;
//   }

//   const users = await User.find(query)
//     .populate('role', 'name')
//     .populate('employeeProfile.departmentId', 'name')
//     .populate('employeeProfile.designationId', 'title')
//     .populate('employeeProfile.reportingManagerId', 'name')
//     .lean();

//   if (format === 'csv') {
//     // Format for CSV export
//     const csvData = users.map(u => ({
//       'Employee ID': u.employeeProfile?.employeeId,
//       'Name': u.name,
//       'Email': u.email,
//       'Phone': u.phone,
//       'Department': u.employeeProfile?.departmentId?.name,
//       'Designation': u.employeeProfile?.designationId?.title,
//       'Status': u.status,
//       'Joined': u.employeeProfile?.dateOfJoining,
//       'Employment Type': u.employeeProfile?.employmentType
//     }));

//     res.status(200).json({
//       status: 'success',
//       data: csvData
//     });
//   } else {
//     res.status(200).json({
//       status: 'success',
//       results: users.length,
//       data: { users }
//     });
//   }
// });

// module.exports = exports;
