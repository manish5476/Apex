'use strict';

const mongoose = require('mongoose');
const { Parser } = require('json2csv');

const User = require('./user.model');
const Organization = require('../../organization/core/organization.model');
const ActivityLog = require('../../activity/activityLogModel');
const Role = require('./role.model');
const Session = require('./session.model');
const Employee = require('../../HRMS/models/employee.model');
const LeaveBalance = require('../../HRMS/models/leaveBalance.model');
const Shift = require('../../HRMS/models/shift.model');
const Department = require('../../HRMS/models/department.model');
const Designation = require('../../HRMS/models/designation.model');
const Branch = require('../../organization/core/branch.model');
const {
  attachEmployeeRecord,
  syncEmployeeFromUserPayload,
} = require('./employeeProfile.service');

const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const factory = require('../../../core/utils/api/handlerFactory');
const imageUploadService = require('../../uploads/imageUploadService');
const logger = require('../../../bootstrap/logger');
const { PERMISSIONS_LIST, VALID_TAGS, getPermissionGroups, mergePermissions } = require('../../../config/permissions');

// ======================================================
//  INTERNAL HELPERS
// ======================================================

const getFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

/** Sensitive permission groups — only owners can grant these */
const SENSITIVE_TAGS = PERMISSIONS_LIST
  .filter(p => ['System', 'Organization', 'Platform'].includes(p.group))
  .map(p => p.tag);


/**
 * Hierarchy & tenant guard — throws AppError on violation.
 * Call before any write operation targeting another user.
 */
const validateUserAction = (actor, target) => {
  if (target.organizationId.toString() !== actor.organizationId.toString())
    throw new AppError('Access denied: User belongs to a different organization.', 403);

  if (target.isOwner && actor._id.toString() !== target._id.toString())
    throw new AppError('The Organization Owner cannot be modified by other users.', 403);

  const actorIsSuper = actor.role?.isSuperAdmin || actor.isSuperAdmin;
  const targetIsSuper = target.role?.isSuperAdmin || target.isSuperAdmin;
  if (targetIsSuper && !actorIsSuper)
    throw new AppError('You do not have permission to modify a Super Administrator.', 403);
};

const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/;
const validatePhone = (phone) => phoneRegex.test(phone);
const cleanPhone = (phone) => phone.replace(/[\s\-\(\)\+]/g, '');

/** Emit a socket event safely — no-op if io is not available */
const emitSocket = (req, room, event, payload) => {
  const io = req.app.get('io');
  if (!io) {
    logger.warn(`[Socket] io not found on app instance — could not emit "${event}" to ${room}`);
    return;
  }
  const memberCount = io.sockets.adapter.rooms.get(room)?.size ?? 0;
  logger.debug(`[Socket] Emitting "${event}" to ${room} (${memberCount} connected)`);
  io.to(room).emit(event, payload);
};

// ======================================================
//  0. PERMISSIONS METADATA
// ======================================================

/**
 * @desc  Get all available permissions (grouped)
 * @route GET /api/v1/users/permissions/available
 */
exports.getAllAvailablePermissions = (req, res) => {
  res.status(200).json({
    status: 'success',
    results: PERMISSIONS_LIST.length,
    data: { groups: getPermissionGroups(), permissions: PERMISSIONS_LIST },
  });
};

// ======================================================
//  1. SELF MANAGEMENT
// ======================================================

/**
 * @desc  Get my profile
 * @route GET /api/v1/users/me
 */
exports.getMyProfile = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate('role', 'name permissions isSuperAdmin')
    .populate('branchId', 'name address phone')
    .select('-password -refreshTokens -loginAttempts -lockUntil');

  if (!user) return next(new AppError('User not found.', 404));

  const hydratedUser = await attachEmployeeRecord(user);
  res.status(200).json({ status: 'success', data: { user: hydratedUser } });
});

/**
 * @desc  Update my profile (self-service, restricted fields)
 * @route PATCH /api/v1/users/me
 */
exports.updateMyProfile = catchAsync(async (req, res, next) => {
  // Strip anything that must go through dedicated endpoints
  const restrictedFields = [
    'password', 'passwordConfirm', 'role', 'isOwner', 'organizationId',
    'isActive', 'status', 'email', 'phone', 'employeeProfile.employeeId',
    'isLoginBlocked', 'loginAttempts', 'lockUntil', 'refreshTokens',
    'permissionOverrides', 'isSuperAdmin', 'branchId',
  ];
  restrictedFields.forEach(f => delete req.body[f]);

  // Explicit allowlist
  const allowedFields = [
    'name', 'avatar', 'language', 'themeId', 'upiId',
    'preferences.theme', 'preferences.notifications',
    'employee', 'preferences'
  ];

  const filteredBody = {};
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key) || key.startsWith('preferences.') || key.startsWith('employee.')) {
      if (key === 'employee.employeeId') return; // double-block via prefix match
      filteredBody[key] = req.body[key];
    }
  });

  // Validate + clean secondary phone if provided
  const secondaryPhone = filteredBody['employee.personal.secondaryPhone']
    ?? filteredBody.employee?.personal?.secondaryPhone;

  if (secondaryPhone) {
    if (!validatePhone(secondaryPhone))
      return next(new AppError('Please provide a valid secondary phone number', 400));

    if (filteredBody.employee && filteredBody.employee.personal) {
      filteredBody.employee.personal.secondaryPhone = cleanPhone(secondaryPhone);
    } else {
      filteredBody['employee.personal.secondaryPhone'] = cleanPhone(secondaryPhone);
    }
  }

  const updatedUserDoc = await User.findByIdAndUpdate(
    req.user.id,
    { $set: filteredBody },
    { new: true, runValidators: true }
  )
    .populate('role', 'name permissions isSuperAdmin')
    .select('-password -refreshTokens -loginAttempts -lockUntil -permissionOverrides');

  await syncEmployeeFromUserPayload({
    user: updatedUserDoc,
    body: filteredBody,
    actorId: req.user._id,
  });

  const updatedUser = await attachEmployeeRecord(updatedUserDoc);
  res.status(200).json({ status: 'success', data: { user: updatedUser } });
});

/**
 * @desc  Upload my profile photo
 * @route POST /api/v1/users/me/photo
 */
exports.uploadProfilePhoto = catchAsync(async (req, res, next) => {
  if (!req.file?.buffer)
    return next(new AppError('Please upload an image file.', 400));

  const currentUser = await User.findById(req.user.id);

  if (currentUser.avatarAsset) {
    try {
      await imageUploadService.deleteFullAsset(currentUser.avatarAsset, req.user.organizationId);
    } catch (err) {
      logger.warn(`Old avatar cleanup skipped for user ${req.user.id}: ${err.message}`);
    }
  }

  const asset = await imageUploadService.uploadAndRecord(req.file, req.user, 'avatar');

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { avatar: asset.url, avatarAsset: asset._id },
    { new: true, runValidators: true }
  ).select('-password -refreshTokens -loginAttempts -lockUntil -permissionOverrides');

  res.status(200).json({
    status: 'success',
    message: 'Profile photo updated successfully.',
    data: { user: updatedUser, asset },
  });
});

/**
 * @desc  Get my effective permissions (role + overrides merged)
 * @route GET /api/v1/users/me/permissions
 */
exports.getMyPermissions = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('role', 'name permissions isSuperAdmin')
    .select('role permissionOverrides isSuperAdmin isOwner emailVerified status')
    .lean();

  const org = await Organization.findById(req.user.organizationId).select('owner').lean();
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
        status: user.status,
      },
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
        revoked: user.permissionOverrides?.revoked ?? [],
      },
      emailVerified: user.emailVerified,
      status: user.status,
    },
  });
});

/**
 * @desc  Get my active devices/sessions
 * @route GET /api/v1/users/me/devices
 */
exports.getMyDevices = catchAsync(async (req, res) => {
  const sessions = await Session.find({ userId: req.user._id, isValid: true })
    .select('-token -refreshToken')
    .sort('-lastActivityAt');

  res.status(200).json({
    status: 'success',
    results: sessions.length,
    data: { currentSessionId: req.session?._id, devices: sessions },
  });
});

/**
 * @desc  Revoke a specific device session
 * @route DELETE /api/v1/users/me/devices/:sessionId
 */
exports.revokeDevice = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;

  const session = await Session.findOne({ _id: sessionId, userId: req.user._id, isValid: true });
  if (!session) return next(new AppError('Session not found or already expired', 404));

  if (req.session?._id?.toString() === sessionId)
    return next(new AppError('Cannot revoke current session. Use logout instead.', 400));

  session.isValid = false;
  session.terminatedAt = new Date();
  await session.save();

  res.status(200).json({ status: 'success', message: 'Device session revoked successfully.' });
});

// ======================================================
//  2. USER MANAGEMENT — READ
// ======================================================

/**
 * @desc  Get all users (org-scoped, filterable)
 * @route GET /api/v1/users
 */
exports.getAllUsers = catchAsync(async (req, res, next) => {
  // Force tenant isolation
  req.query.organizationId = req.user.organizationId;

  // Since we separated Employee from User, we cannot filter Users directly by Department/Designation using native MongoDB queries on the User collection.
  // For a true Employee list, the frontend should use the /api/v1/hrms/employees endpoint.
  // For backwards compatibility, we will strip these HRMS filters from the generic User query.
  delete req.query.department;
  delete req.query.designation;
  delete req.query.reportingTo;
  delete req.query.employmentType;

  // Use ApiFeatures to execute the generic User query
  const ApiFeatures = require('../../../core/utils/api/ApiFeatures');
  const features = new ApiFeatures(User.find({ organizationId: req.user.organizationId }), req.query)
    .filter()
    .search(['name', 'email', 'phone'])
    .sort()
    .limitFields()
    .paginate();

  features.query = features.query
    .populate({ path: 'role', select: 'name' })
    .populate({ path: 'branchId', select: 'name' });

  const result = await features.execute();

  // Hydrate the users with their Employee records
  const hydratedUsers = await Promise.all(
    result.data.map(async (user) => {
      return await attachEmployeeRecord(user);
    })
  );

  res.status(200).json({
    status: 'success',
    results: result.results,
    pagination: result.pagination,
    data: { data: hydratedUsers },
  });
});

/**
 * @desc  Get user by ID
 * @route GET /api/v1/users/:id
 */
exports.getUser = catchAsync(async (req, res, next) => {
  const user = await User.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  })
    .populate('role', 'name permissions isSuperAdmin')
    .populate('branchId', 'name address city')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .populate('blockedBy', 'name')
    .select('-password -refreshTokens -loginAttempts -lockUntil -permissionOverrides');

  if (!user) return next(new AppError('User not found or unauthorized', 404));

  const hydratedUser = await attachEmployeeRecord(user);
  res.status(200).json({ status: 'success', data: { user: hydratedUser } });
});

/**
 * @desc  Search users
 * @route GET /api/v1/users/search
 */
exports.searchUsers = (req, res, next) => {
  if (req.query.q) req.query.search = req.query.q;
  req.query.organizationId = req.user.organizationId;

  factory.getAll(User, {
    searchFields: ['name', 'email', 'phone'],
    select: '-permissionOverrides -loginAttempts -lockUntil -refreshTokens -passwordResetToken -emailVerificationToken',
    populate: [
      { path: 'role', select: 'name' },
      { path: 'branchId', select: 'name' },
    ],
  })(req, res, next);
};

/**
 * @desc  Get user activity + sessions
 * @route GET /api/v1/users/:id/activity
 */
exports.getUserActivity = catchAsync(async (req, res, next) => {
  const { id: userId } = req.params;
  const orgId = req.user.organizationId;

  const targetExists = await User.exists({ _id: userId, organizationId: orgId });
  if (!targetExists) return next(new AppError('User not found or access denied.', 404));

  const [activities, sessions] = await Promise.all([
    ActivityLog.find({ organizationId: orgId, $or: [{ userId }, { user: userId }] })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),

    // Session is keyed by userId only — organizationId not stored on sessions
    Session.find({ userId })
      .select('-token -refreshToken')
      .sort('-createdAt')
      .limit(50)
      .lean(),
  ]);

  res.status(200).json({
    status: 'success',
    data: { activities, sessions, totalActivities: activities.length, totalSessions: sessions.length },
  });
});

/**
 * @desc  Get org reporting hierarchy (tree)
 * @route GET /api/v1/users/hierarchy
 */
exports.getOrgHierarchy = catchAsync(async (req, res, next) => {
  // Optional depth limit to avoid huge payloads for large orgs
  const maxDepth = parseInt(req.query.depth) || 5;

  const users = await User.find({
    organizationId: req.user.organizationId,
    isActive: true,
    status: 'approved',
  })
    .select('name avatar email')
    .lean();

  const employees = await Employee.find({
    organizationId: req.user.organizationId,
    user: { $in: users.map(u => u._id) }
  })
    .populate('designationId', 'title level')
    .populate('departmentId', 'name')
    .lean();

  const empMap = {};
  employees.forEach(e => { empMap[e.user.toString()] = e; });

  const userMap = {};
  const roots = [];

  users.forEach(u => { 
    const emp = empMap[u._id.toString()] || {};
    userMap[u._id.toString()] = { 
      ...u, 
      employeeProfile: {
        designationId: emp.designationId,
        departmentId: emp.departmentId,
        reportingManagerId: emp.reportingManagerId
      },
      reportees: [] 
    }; 
  });

  users.forEach(u => {
    const uId = u._id.toString();
    const managerId = userMap[uId].employeeProfile.reportingManagerId?.toString();
    if (managerId && userMap[managerId]) {
      userMap[managerId].reportees.push(userMap[uId]);
    } else {
      roots.push(userMap[uId]);
    }
  });

  res.status(200).json({
    status: 'success',
    data: { totalUsers: users.length, maxDepth, hierarchy: roots },
  });
});

/**
 * @desc  Get users by department
 * @route GET /api/v1/users/by-department/:departmentId
 */
exports.getUsersByDepartment = catchAsync(async (req, res, next) => {
  const { departmentId } = req.params;

  const department = await Department.findOne({ _id: departmentId, organizationId: req.user.organizationId });
  if (!department) return next(new AppError('Department not found', 404));

  const employeesInDept = await Employee.find({
    organizationId: req.user.organizationId,
    departmentId: departmentId,
    status: 'active'
  })
    .populate('designationId', 'title')
    .lean();

  const userIds = employeesInDept.map(e => e.user);

  const users = await User.find({
    _id: { $in: userIds },
    isActive: true,
  })
    .select('name email phone avatar')
    .sort('name')
    .lean();
    
  const empMap = {};
  employeesInDept.forEach(e => { empMap[e.user.toString()] = e; });

  const combinedUsers = users.map(u => ({
    ...u,
    employeeProfile: {
        designationId: empMap[u._id.toString()]?.designationId,
        employeeId: empMap[u._id.toString()]?.employeeId
    }
  }));

  res.status(200).json({ status: 'success', results: combinedUsers.length, data: { users: combinedUsers } });
});

// ======================================================
//  3. USER MANAGEMENT — WRITE
// ======================================================

/**
 * @desc  Create new user (with leave balance, in transaction)
 * @route POST /api/v1/users
 */
exports.createUser = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orgId = req.user.organizationId;

    // Force org + audit fields; strip privilege-escalation fields
    req.body.organizationId = orgId;
    req.body.createdBy = req.user._id;
    req.body.updatedBy = req.user._id;

    const escalationFields = [
      'permissionOverrides', 'isOwner', 'isSuperAdmin',
      'loginAttempts', 'lockUntil', 'refreshTokens', 'isLoginBlocked',
    ];
    escalationFields.forEach(f => delete req.body[f]);

    const employeePayload = req.body.employee || {};
    const personal = employeePayload.personal || {};
    const attendanceConfig = employeePayload.attendanceConfig || {};
    const { phone } = req.body;

    // Phone validation
    if (phone) {
      if (!validatePhone(phone)) throw new AppError('Please provide a valid primary phone number', 400);
      req.body.phone = cleanPhone(phone);
    }
    if (personal.secondaryPhone) {
      if (!validatePhone(personal.secondaryPhone))
        throw new AppError('Please provide a valid secondary phone number', 400);
      personal.secondaryPhone = cleanPhone(personal.secondaryPhone);
      employeePayload.personal.secondaryPhone = personal.secondaryPhone;
    }

    // Validate all reference IDs belong to this org
    if (attendanceConfig.shiftId) {
      const ok = await Shift.exists({ _id: attendanceConfig.shiftId, organizationId: orgId });
      if (!ok) throw new AppError('Invalid Shift ID.', 400);
    }
    if (employeePayload.departmentId) {
      const ok = await Department.exists({ _id: employeePayload.departmentId, organizationId: orgId });
      if (!ok) throw new AppError('Invalid Department ID.', 400);
    }
    if (employeePayload.designationId) {
      const ok = await Designation.exists({ _id: employeePayload.designationId, organizationId: orgId });
      if (!ok) throw new AppError('Invalid Designation ID.', 400);
    }
    if (req.body.branchId) {
      const ok = await Branch.exists({ _id: req.body.branchId, organizationId: orgId });
      if (!ok) throw new AppError('Invalid Branch ID.', 400);
    }

    // Auto-generate secure temp password — admin never sets it
    // User must reset via forgot-password flow on first login
    if (!req.body.password) {
      const tempPassword = require('crypto').randomBytes(16).toString('hex');
      req.body.password = tempPassword;
      req.body.passwordConfirm = tempPassword;
      req.body.mustChangePassword = true;
    }

    if (req.body.upiId === '') {
      delete req.body.upiId;
    }

    if (req.body.emailVerified === undefined) req.body.emailVerified = false;

    const [newUser] = await User.create([req.body], { session });

    const employee = await syncEmployeeFromUserPayload({
      user: newUser,
      body: req.body,
      actorId: req.user._id,
      session,
    });

    await LeaveBalance.create([{
      user: newUser._id,
      organizationId: orgId,
      branchId: req.body.branchId,
      financialYear: getFinancialYear(),
      casualLeave: { total: 12, used: 0 },
      sickLeave: { total: 10, used: 0 },
      earnedLeave: { total: 0, used: 0 },
    }], { session });

    await session.commitTransaction();

    newUser.password = undefined;
    newUser.refreshTokens = undefined;

    res.status(201).json({
      status: 'success',
      data: {
        user: { ...newUser.toObject({ virtuals: true }), employee },
        message: 'User created. They must reset their password on first login.',
      },
    });

  } catch (err) {
    await session.abortTransaction();

    if (err.code === 11000) {
      const field = err.keyPattern?.email ? 'Email'
        : err.keyPattern?.phone ? 'Phone'
          : (err.keyPattern?.['employeeProfile.employeeId'] || err.keyPattern?.employeeId) ? 'Employee ID'
            : 'Field';
      return next(new AppError(`${field} already exists in this organization.`, 400));
    }

    return next(err);
  } finally {
    session.endSession();
  }
});

/**
 * @desc  Update user (admin)
 * @route PATCH /api/v1/users/:id
 */
exports.updateUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError('User not found', 404));

  validateUserAction(req.user, targetUser);

  // Strip fields that have dedicated endpoints
  const forbiddenFields = [
    'password', 'passwordConfirm', 'organizationId', 'createdBy',
    'isOwner', 'refreshTokens', 'loginAttempts', 'lockUntil',
    'permissionOverrides', 'isSuperAdmin',
  ];
  forbiddenFields.forEach(f => delete req.body[f]);

  if (req.body.phone) {
    if (!validatePhone(req.body.phone))
      return next(new AppError('Please provide a valid primary phone number', 400));
    req.body.phone = cleanPhone(req.body.phone);
  }

  // Flatten nested objects to dot-notation for safe partial updates
  const updatePayload = { ...req.body, updatedBy: req.user._id };

  const flatten = (obj, prefix) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    Object.keys(obj).forEach(key => {
      if (obj[key] !== undefined)
        updatePayload[`${prefix}.${key}`] = obj[key];
    });
    delete updatePayload[prefix];
  };

  if (req.body.employee) flatten(req.body.employee, 'employee');
  if (req.body.preferences) flatten(req.body.preferences, 'preferences');

  // Validate all reference IDs are org-bound
  if (updatePayload['employee.reportingManagerId']) {
    const ok = await User.exists({ _id: updatePayload['employee.reportingManagerId'], organizationId: req.user.organizationId });
    if (!ok) return next(new AppError('Reporting Manager not found.', 400));
  }
  if (updatePayload['employee.departmentId']) {
    const ok = await Department.exists({ _id: updatePayload['employee.departmentId'], organizationId: req.user.organizationId });
    if (!ok) return next(new AppError('Department not found.', 400));
  }
  if (updatePayload['employee.designationId']) {
    const ok = await Designation.exists({ _id: updatePayload['employee.designationId'], organizationId: req.user.organizationId });
    if (!ok) return next(new AppError('Designation not found.', 400));
  }

  const updateOperation = { $set: updatePayload };
  const unsetPayload = {};

  if (updatePayload.upiId === '' || updatePayload.upiId === null) {
    unsetPayload.upiId = 1;
    delete updatePayload.upiId;
  }

  if (Object.keys(unsetPayload).length > 0) {
    updateOperation.$unset = unsetPayload;
  }

  const updatedUserDoc = await User.findByIdAndUpdate(
    req.params.id,
    updateOperation,
    { new: true, runValidators: true }
  )
    .populate('role', 'name permissions isSuperAdmin')
    .select('-password -refreshTokens -loginAttempts -lockUntil -permissionOverrides');

  await syncEmployeeFromUserPayload({
    user: updatedUserDoc,
    body: req.body,
    actorId: req.user._id,
  });

  const updatedUser = await attachEmployeeRecord(updatedUserDoc);

  emitSocket(req, `user:${req.params.id}`, 'permissions:updated', {
    type: 'role_assigned', userId: String(req.params.id), timestamp: new Date().toISOString(),
  });

  res.status(200).json({ status: 'success', data: { user: updatedUser } });
});

/**
 * @desc  Delete user (soft delete + force logout)
 * @route DELETE /api/v1/users/:id
 */
exports.deleteUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError('User not found', 404));

  validateUserAction(req.user, targetUser);

  targetUser.isActive = false;
  targetUser.status = 'inactive';
  targetUser.isLoginBlocked = true;
  targetUser.blockReason = 'User deleted by administrator';
  targetUser.blockedAt = new Date();
  targetUser.blockedBy = req.user._id;
  targetUser.updatedBy = req.user._id;

  await targetUser.save({ validateBeforeSave: false });

  await Session.updateMany(
    { userId: targetUser._id, isValid: true },
    { isValid: false, terminatedAt: new Date() }
  );

  await Employee.findOneAndUpdate(
    { user: targetUser._id, organizationId: targetUser.organizationId },
    { $set: { status: 'inactive', dateOfExit: new Date(), updatedBy: req.user._id } }
  );

  emitSocket(req, `user:${targetUser._id}`, 'forceLogout', {
    reason: 'account_deleted', timestamp: new Date().toISOString(),
  });

  // 204 = No Content — no body allowed by HTTP spec
  res.status(204).send();
});

/**
 * @desc  Admin reset a user's password
 * @route PATCH /api/v1/users/:id/password
 */
exports.adminUpdatePassword = catchAsync(async (req, res, next) => {
  const { password, passwordConfirm } = req.body;

  if (!password || !passwordConfirm)
    return next(new AppError('Please provide password and passwordConfirm', 400));
  if (password !== passwordConfirm)
    return next(new AppError('Passwords do not match', 400));
  if (password.length < 8)
    return next(new AppError('Password must be at least 8 characters', 400));

  const targetUser = await User.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  }).select('+password');

  if (!targetUser) return next(new AppError('User not found', 404));

  validateUserAction(req.user, targetUser);

  targetUser.password = password;
  targetUser.passwordConfirm = passwordConfirm;
  targetUser.passwordChangedAt = Date.now() - 1000;
  targetUser.mustChangePassword = true; // force them to set their own on next login
  targetUser.updatedBy = req.user._id;

  await targetUser.save();

  // Invalidate ALL sessions for this user (including if actor == target)
  await Session.updateMany(
    { userId: targetUser._id, isValid: true },
    { isValid: false, terminatedAt: new Date() }
  );

  emitSocket(req, `user:${targetUser._id}`, 'forceLogout', {
    reason: 'password_reset_by_admin', timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    status: 'success',
    message: 'Password updated. User has been logged out of all devices.',
  });
});

/**
 * @desc  Upload user photo (admin)
 * @route PATCH /api/v1/users/:id/photo
 */
exports.uploadUserPhotoByAdmin = catchAsync(async (req, res, next) => {
  if (!req.file?.buffer)
    return next(new AppError('Please upload an image file.', 400));

  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return next(new AppError('User not found.', 404));

  validateUserAction(req.user, targetUser);

  if (targetUser.avatarAsset) {
    try {
      await imageUploadService.deleteFullAsset(targetUser.avatarAsset, targetUser.organizationId);
    } catch (err) {
      logger.warn(`Old avatar cleanup skipped for user ${targetUser._id}: ${err.message}`);
    }
  }

  const asset = await imageUploadService.uploadAndRecord(req.file, req.user, 'avatar');

  const updatedUser = await User.findByIdAndUpdate(
    targetUser._id,
    { avatar: asset.url, avatarAsset: asset._id, updatedBy: req.user._id },
    { new: true, runValidators: true }
  ).select('-password -refreshTokens -loginAttempts -lockUntil -permissionOverrides');

  res.status(200).json({
    status: 'success',
    message: 'User photo updated by admin.',
    data: { user: updatedUser, asset },
  });
});

/**
 * @desc  Update per-user permission overrides
 * @route PATCH /api/v1/users/:id/permission-overrides
 */
exports.updatePermissionOverrides = catchAsync(async (req, res, next) => {
  const { grant = [], revoke = [] } = req.body;
  const { id: userId } = req.params;
  const orgId = req.user.organizationId;

  if (!Array.isArray(grant) || !Array.isArray(revoke))
    return next(new AppError('grant and revoke must be arrays', 400));

  const invalid = [...grant, ...revoke].filter(p => !VALID_TAGS.includes(p));
  if (invalid.length)
    return next(new AppError(`Invalid permissions: ${invalid.join(', ')}`, 400));

  const conflict = grant.filter(p => revoke.includes(p));
  if (conflict.length)
    return next(new AppError(`Cannot grant and revoke the same permission: ${conflict.join(', ')}`, 400));

  const target = await User.findOne({ _id: userId, organizationId: orgId }).populate('role');
  if (!target) return next(new AppError('User not found', 404));

  validateUserAction(req.user, target);

  if (!req.user.isOwner && grant.some(p => SENSITIVE_TAGS.includes(p)))
    return next(new AppError('Only owners can grant system-level permissions', 403));

  // Prevent granting permissions the actor doesn't hold themselves
  if (!req.user.isOwner) {
    const actorUser = await User.findById(req.user._id).populate('role', 'permissions').select('permissionOverrides').lean();
    const actorPerms = new Set(mergePermissions(actorUser.role?.permissions, actorUser.permissionOverrides));
    const cannotGrant = grant.filter(p => !actorPerms.has(p));
    if (cannotGrant.length)
      return next(new AppError(`You cannot grant permissions you don't have: ${cannotGrant.join(', ')}`, 403));
  }

  target.permissionOverrides = { granted: grant, revoked: revoke };
  target.updatedBy = req.user._id;
  await target.save({ validateBeforeSave: false });

  emitSocket(req, `user:${userId}`, 'permissions:updated', {
    type: 'override', userId, timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    status: 'success',
    message: 'Permission overrides updated.',
    data: { userId, overrides: target.permissionOverrides },
  });
});

// ======================================================
//  4. STATUS & ACCESS CONTROL
// ======================================================

/**
 * @desc  Toggle user block/unblock (kill switch)
 * @route POST /api/v1/users/toggle-block
 */
exports.toggleUserBlock = catchAsync(async (req, res, next) => {
  const { userId, blockStatus, reason } = req.body;

  if (!userId || blockStatus === undefined)
    return next(new AppError('Please provide userId and blockStatus', 400));

  const targetUser = await User.findById(userId).populate('role');
  if (!targetUser) return next(new AppError('User not found', 404));

  validateUserAction(req.user, targetUser);

  // Fetch io once at the top — fixes the 'use strict' redeclaration bug
  const io = req.app.get('io');

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

    if (io) {
      io.to(`user:${userId}`).emit('forceLogout', {
        reason: 'account_blocked', timestamp: new Date().toISOString(),
      });
    }
  } else {
    targetUser.blockReason = undefined;
    targetUser.blockedAt = undefined;
    targetUser.blockedBy = undefined;
  }

  await targetUser.save({ validateBeforeSave: false });

  // Notify on unblock so frontend can refresh permissions
  if (!blockStatus) {
    emitSocket(req, `user:${userId}`, 'permissions:updated', {
      type: 'status_change', userId, status: 'active', timestamp: new Date().toISOString(),
    });
  }

  res.status(200).json({
    status: 'success',
    message: blockStatus ? 'User blocked successfully.' : 'User unblocked.',
    data: { id: targetUser._id, isLoginBlocked: targetUser.isLoginBlocked, reason: targetUser.blockReason },
  });
});

/**
 * @desc  Activate user
 * @route PATCH /api/v1/users/:id/activate
 */
exports.activateUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError('User not found', 404));

  validateUserAction(req.user, targetUser);

  targetUser.status = 'approved';
  targetUser.isActive = true;
  targetUser.isLoginBlocked = false;
  targetUser.blockReason = undefined;
  targetUser.blockedAt = undefined;
  targetUser.blockedBy = undefined;
  targetUser.updatedBy = req.user._id;

  await targetUser.save({ validateBeforeSave: false });

  await Employee.findOneAndUpdate(
    { user: targetUser._id, organizationId: targetUser.organizationId },
    {
      $set: { status: 'active', updatedBy: req.user._id },
      $unset: { dateOfExit: 1, exitReason: 1 },
    }
  );

  emitSocket(req, `user:${req.params.id}`, 'permissions:updated', {
    type: 'status_change', userId: String(req.params.id), status: 'active', timestamp: new Date().toISOString(),
  });

  res.status(200).json({ status: 'success', message: 'User activated.', data: { user: targetUser } });
});

/**
 * @desc  Deactivate user
 * @route PATCH /api/v1/users/:id/deactivate
 */
exports.deactivateUser = catchAsync(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id).populate('role');
  if (!targetUser) return next(new AppError('User not found', 404));

  validateUserAction(req.user, targetUser);

  targetUser.status = 'inactive';
  targetUser.isActive = false;
  targetUser.updatedBy = req.user._id;

  await targetUser.save({ validateBeforeSave: false });

  await Session.updateMany(
    { userId: targetUser._id, isValid: true },
    { isValid: false, terminatedAt: new Date() }
  );

  await Employee.findOneAndUpdate(
    { user: targetUser._id, organizationId: targetUser.organizationId },
    { $set: { status: 'inactive', updatedBy: req.user._id } }
  );

  emitSocket(req, `user:${req.params.id}`, 'permissions:updated', {
    type: 'status_change', userId: String(req.params.id), status: 'inactive', timestamp: new Date().toISOString(),
  });

  res.status(200).json({ status: 'success', message: 'User deactivated.', data: { user: targetUser } });
});

/**
 * @desc  Check if current user has a specific permission
 * @route POST /api/v1/users/check-permission
 */
exports.checkPermission = catchAsync(async (req, res, next) => {
  const { permission } = req.body;
  if (!permission) return next(new AppError('Please provide permission to check', 400));

  const user = await User.findById(req.user._id)
    .populate('role', 'name permissions isSuperAdmin')
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
    status: 'success',
    data: { hasPermission, permission, role: user.role?.name },
  });
});

/**
 * @desc  Bulk update user status (with super admin guard)
 * @route POST /api/v1/users/bulk-status
 */
exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
  const { userIds, status, reason } = req.body;

  if (!userIds?.length || !status)
    return next(new AppError('Please provide user IDs and status', 400));

  const validStatuses = ['approved', 'rejected', 'inactive', 'suspended'];
  if (!validStatuses.includes(status))
    return next(new AppError('Invalid status', 400));

  const actorIsSuper = req.user.role?.isSuperAdmin || req.user.isSuperAdmin;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await User.updateMany(
      {
        _id: { $in: userIds },
        organizationId: req.user.organizationId,
        isOwner: { $ne: true },
        // Non-super admins cannot bulk-update super admins
        ...(actorIsSuper ? {} : { isSuperAdmin: { $ne: true } }),
      },
      {
        $set: {
          status,
          updatedBy: req.user._id,
          ...(status === 'suspended' && {
            isLoginBlocked: true,
            blockReason: reason || 'Bulk status update',
            blockedAt: new Date(),
            blockedBy: req.user._id,
          }),
        },
      },
      { session }
    );

    if (status === 'suspended' || status === 'inactive') {
      await Session.updateMany(
        { userId: { $in: userIds }, isValid: true },
        { isValid: false, terminatedAt: new Date() },
        { session }
      );

      const io = req.app.get('io');
      if (io) {
        userIds.forEach(uid => {
          io.to(`user:${uid}`).emit('forceLogout', {
            reason: status === 'suspended' ? 'account_suspended' : 'account_deactivated',
            timestamp: new Date().toISOString(),
          });
        });
      }
    }

    await session.commitTransaction();

    res.status(200).json({
      status: 'success',
      data: { matched: result.matchedCount, modified: result.modifiedCount },
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

// ======================================================
//  5. EXPORT & REPORTING
// ======================================================

/**
 * @desc  Export users as JSON or real CSV
 * @route GET /api/v1/users/export
 */
exports.exportUsers = catchAsync(async (req, res, next) => {
  const { format = 'json', departmentId } = req.query;

  const query = {
    organizationId: req.user.organizationId,
    isActive: req.query.isActive !== 'false',
  };
  
  if (departmentId) {
     const emps = await Employee.find({ organizationId: req.user.organizationId, departmentId }).select('user').lean();
     query._id = { $in: emps.map(e => e.user) };
  }

  const users = await User.find(query)
    .select('-permissionOverrides -loginAttempts -lockUntil -refreshTokens -passwordResetToken -emailVerificationToken -password')
    .populate('role', 'name')
    .lean();

  const employees = await Employee.find({
      organizationId: req.user.organizationId,
      user: { $in: users.map(u => u._id) }
  })
    .populate('departmentId', 'name')
    .populate('designationId', 'title')
    .populate('reportingManagerId', 'name')
    .lean();
    
  const empMap = {};
  employees.forEach(e => { empMap[e.user.toString()] = e; });
  
  const combinedUsers = users.map(u => {
      const emp = empMap[u._id.toString()];
      return {
          ...u,
          employeeProfile: emp ? {
              departmentId: emp.departmentId,
              designationId: emp.designationId,
              reportingManagerId: emp.reportingManagerId,
              employeeId: emp.employeeId,
              employmentType: emp.employmentType,
              dateOfJoining: emp.dateOfJoining
          } : {}
      };
  });

  if (format === 'csv') {
    const fields = [
      { label: 'Employee ID', value: 'employeeProfile.employeeId' },
      { label: 'Name', value: 'name' },
      { label: 'Email', value: 'email' },
      { label: 'Phone', value: 'phone' },
      { label: 'Department', value: 'employeeProfile.departmentId.name' },
      { label: 'Designation', value: 'employeeProfile.designationId.title' },
      { label: 'Status', value: 'status' },
      { label: 'Employment Type', value: 'employeeProfile.employmentType' },
      { label: 'Date of Joining', value: 'employeeProfile.dateOfJoining' },
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(combinedUsers);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users_export.csv');
    return res.status(200).send(csv);
  }

  res.status(200).json({ status: 'success', results: combinedUsers.length, data: { users: combinedUsers } });
});

module.exports = exports;
