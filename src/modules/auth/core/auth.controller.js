'use strict';

const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UAParser = require('ua-parser-js');

const User = require('./user.model');
const Organization = require('../../organization/core/organization.model');
const Role = require('./role.model');
const Session = require('./session.model');
const Employee = require('../../HRMS/models/employee.model');
const { attachEmployeeRecord } = require('./employeeProfile.service');

const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const sendEmail = require('../../../core/infra/email');
const logger = require('../../../bootstrap/logger');
const { signAccessToken, signRefreshToken } = require('../../../core/utils/helpers/authUtils');
const NotificationService = require('../../notification/core/notification.service');
const { emitToUser } = require('../../../socketHandlers/socket');
const { mergePermissions, VALID_TAGS } = require('../../../config/permissions');

// ======================================================
//  1. HELPERS
// ======================================================

const getClientIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.connection?.remoteAddress ||
  req.socket?.remoteAddress ||
  req.ip ||
  'unknown';

const getDeviceInfo = (req) => {
  try {
    const parser = new UAParser(req.headers['user-agent'] || '');
    const browser = parser.getBrowser()?.name || 'unknown';
    const os = parser.getOS()?.name || 'unknown';
    const dev = parser.getDevice();
    const device = dev?.model || dev?.type || 'unknown';
    return { browser, os, device };
  } catch {
    return { browser: 'unknown', os: 'unknown', device: 'unknown' };
  }
};

/**
 * Cookie config — secure on production, lax on local dev.
 * refreshToken cookie lives 90 days (matches refresh token TTL).
 */
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };
};

const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/;
const validatePhone = (phone) => phoneRegex.test(phone);
const cleanPhone = (phone) => phone.replace(/[\s\-\(\)\+]/g, '');

// ======================================================
//  2. SIGNUP
//  POST /api/v1/auth/signup
// ======================================================
exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, phone, uniqueShopId } = req.body;

  const requiredFields = { name, email, password, passwordConfirm, uniqueShopId, phone };
  const missingFields = Object.keys(requiredFields).filter(field => !requiredFields[field]);

  if (missingFields.length > 0) {
    return next(new AppError(`The following fields are required: ${missingFields.join(', ')}`, 400));
  }

  if (!validatePhone(phone))
    return next(new AppError('Please provide a valid phone number', 400));

  const organization = await Organization.findOne({ uniqueShopId }).populate('owner', 'name email');
  if (!organization) return next(new AppError('Invalid Shop ID', 404));

  const cleanedPhone = cleanPhone(phone);

  // Check for duplicate email OR phone within this org
  const existing = await User.findOne({
    organizationId: organization._id,
    $or: [{ email: email.toLowerCase() }, { phone: cleanedPhone }],
  });

  if (existing) {
    if (existing.email === email.toLowerCase()) {
      return next(new AppError(
        existing.status === 'pending'
          ? 'Registration pending approval. Please check your email for status.'
          : 'Email already registered in this organization.',
        400
      ));
    }
    if (existing.phone === cleanedPhone)
      return next(new AppError('Phone number already registered in this organization.', 400));
  }

  const newUser = await User.create({
    name,
    email: email.toLowerCase(),
    phone: cleanedPhone,
    password,
    passwordConfirm,
    organizationId: organization._id,
    status: 'pending',
    isActive: true,
    isLoginBlocked: false,
  });

  // Notifications to org owner (all non-blocking)
  if (organization.owner?._id) {
    const ownerId = organization.owner._id.toString();

    NotificationService.create({
      organizationId: organization._id,
      recipientId: ownerId,
      businessType: 'USER_SIGNUP',
      title: 'New Employee Signup Request',
      message: `${name} (${email}) is waiting for approval. Phone: ${phone}`
    }).catch(err => logger.error('DB Notification creation failed:', err.message));

    sendEmail({
      email: organization.owner.email,
      subject: 'New Signup Request - Awaits Approval',
      html: `
        <h2>New Signup Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Organization:</strong> ${organization.name}</p>
        <p>Please login to the admin panel to approve or reject this request.</p>
        <a href="${process.env.FRONTEND_URL}/admin/users/pending">Review Request</a>
      `,
    }).catch(err => logger.error('Signup email to admin failed:', err.message));
  }

  sendEmail({
    email: newUser.email,
    subject: 'Registration Received - Awaiting Approval',
    html: `
      <h2>Welcome ${name}!</h2>
      <p>Your registration has been received and is awaiting approval from your organization administrator.</p>
      <p>You will receive another email once your account is approved.</p>
      <p><strong>Organization:</strong> ${organization.name}</p>
      <p><strong>Registered Email:</strong> ${email}</p>
      <p><strong>Registered Phone:</strong> ${phone}</p>
    `,
  }).catch(err => logger.error('Welcome email to user failed:', err.message));

  res.status(201).json({
    status: 'success',
    message: 'Signup successful. Awaiting organization approval. You will be notified via email once approved.',
    data: { email: newUser.email, name: newUser.name, status: newUser.status },
  });
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password, uniqueShopId } = req.body;

  if (!email || !password || !uniqueShopId)
    return next(new AppError('Email, password and Shop ID are required.', 400));

  const organization = await Organization.findOne({ uniqueShopId: uniqueShopId.trim().toUpperCase() });
  if (!organization) return next(new AppError('Invalid Shop ID.', 404));

  const user = await User.findOne({
    organizationId: organization._id,
    $or: [{ email: email.toLowerCase() }, { phone: cleanPhone(email) }],
  })
    .select('+password +loginAttempts +lockUntil +permissionOverrides')
    .populate({ path: 'role', select: 'name permissions isSuperAdmin isActive' });

  if (!user) return next(new AppError('Invalid credentials.', 401));

  if (user.isLocked?.()) {
    const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return next(new AppError(`Account temporarily locked. Try again in ${mins} minutes.`, 423));
  }

  const isPasswordCorrect = await user.correctPassword(password, user.password);
  if (!isPasswordCorrect) {
    await user.incrementLoginAttempts();
    const updated = await User.findById(user._id).select('+loginAttempts +lockUntil');
    if (updated.lockUntil && updated.lockUntil > Date.now())
      return next(new AppError('Too many failed attempts. Account locked for 2 hours.', 423));
    return next(new AppError('Invalid credentials.', 401));
  }

  if (user.isLoginBlocked)
    return next(new AppError(
      `Access Denied: Account blocked. Reason: ${user.blockReason || 'Administrative Action'}. ` +
      'Please contact your organization administrator.', 403
    ));

  const statusMessages = {
    pending: 'Account awaiting approval from organization administrator.',
    rejected: 'Account registration was rejected. Please contact administrator.',
    inactive: 'Account is inactive.',
    suspended: 'Account has been suspended.',
  };
  if (user.status !== 'approved')
    return next(new AppError(statusMessages[user.status] || 'Account not approved.', 401));

  if (!user.isActive)
    return next(new AppError('Account is deactivated. Please contact administrator.', 401));

  if (!user.emailVerified && process.env.REQUIRE_EMAIL_VERIFICATION === 'true')
    return next(new AppError('Please verify your email before logging in.', 401));

  // ── Session concurrency ─────────────────────────────────────────────────
  // Only count sessions whose access-token has NOT yet expired.
  // Without this, sessions whose JWT expired naturally (no explicit logout)
  // keep isValid:true in DB and falsely block new logins.
  const accessTokenTtlMs = (() => {
    const raw = process.env.ACCESS_TOKEN_EXPIRES_IN || '1h';
    const match = raw.match(/^(\d+)([smhd])$/);
    if (!match) return 60 * 60 * 1000; // fallback 1h
    const [, num, unit] = match;
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return parseInt(num, 10) * mult[unit];
  })();
  const tokenNotExpiredBefore = new Date(Date.now() - accessTokenTtlMs);
  const activeSessions = await Session.find({
    userId: user._id,
    isValid: true,
    lastActivityAt: { $gte: tokenNotExpiredBefore },
  });
  const maxSessions = user.maxConcurrentSessions || 1;

  if (activeSessions.length >= maxSessions && !req.body.forceLogout) {
    return res.status(409).json({
      status: 'fail',
      code: 'SESSION_CONCURRENCY_LIMIT',
      message: `Maximum concurrent sessions (${maxSessions}) reached. Would you like to logout from other devices?`,
      data: {
        maxSessions,
        activeSessionsCount: activeSessions.length,
        sessions: activeSessions.map(s => ({
          sessionId: s._id,
          device: s.deviceType || s.device,
          browser: s.browser,
          os: s.os,
          ip: s.ipAddress,
          lastActivity: s.lastActivityAt,
        })),
      },
    });
  }

  if (req.body.forceLogout || maxSessions === 1) {
    await Session.updateMany(
      { userId: user._id, isValid: true },
      { isValid: false, terminatedAt: new Date(), token: 'revoked', refreshToken: 'revoked' }
    );
  }

  // ── Token generation ─────────────────────────────────────────────────────
  // FIX (Issue 2): derive isOwner from DB field, not string comparison
  const isOwner = user.isOwner || organization.owner.toString() === user._id.toString();
  const isSuperAdmin = !!(user.role?.isSuperAdmin || user.isSuperAdmin);

  const accessToken = signAccessToken({
    id: user._id,
    organizationId: user.organizationId,
    isOwner,
    isSuperAdmin,
  });
  const refreshToken = signRefreshToken({ id: user._id });

  const { browser, os, device } = getDeviceInfo(req);

  const session = await Session.create({
    userId: user._id,
    token: accessToken,
    refreshToken,
    isValid: true,
    browser,
    os,
    deviceType: device,
    ipAddress: getClientIp(req),
    organizationId: user.organizationId,
    lastActivityAt: new Date(),
  });

  res.cookie('refreshToken', refreshToken, getCookieOptions());

  // ── FIX (Issue 7): single save — merge all updates together ─────────────
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  user.lastLoginIP = getClientIp(req);
  user.refreshTokens = [];

  const deviceExists = user.devices?.some(d =>
    d.deviceId === req.headers['x-device-id'] ||
    (d.userAgent === req.headers['user-agent'] && d.deviceType === device)
  );
  if (!deviceExists && req.headers['user-agent']) {
    user.devices = user.devices || [];
    user.devices.push({
      deviceId: req.headers['x-device-id'] || crypto.randomBytes(16).toString('hex'),
      deviceType: device.includes('mobile') ? 'mobile' : device.includes('tablet') ? 'tablet' : 'web',
      lastActive: new Date(),
      userAgent: req.headers['user-agent'],
    });
    if (user.devices.length > 10) user.devices = user.devices.slice(-10);
  }

  await user.save({ validateBeforeSave: false });

  // ── FIX (Issue 1): permissions — send ['*'] not the full tag list ────────
  const permissions = (isOwner || isSuperAdmin)
    ? ['*']
    : mergePermissions(user.role?.permissions, user.permissionOverrides);

  // ── FIX (Issue 3): strip sensitive fields from user before sending ───────
  const userObj = user.toObject();

  // Attach canonical HRMS employee record
  const employee = await Employee.findOne({ user: user._id })
    .populate('departmentId', 'name')
    .populate('designationId', 'title level')
    .populate('reportingManagerId', 'name email');
  userObj.employee = employee;

  delete userObj.password;
  delete userObj.loginAttempts;
  delete userObj.lockUntil;
  delete userObj.refreshTokens;
  delete userObj.passwordResetToken;
  delete userObj.passwordResetExpires;
  delete userObj.emailVerificationToken;
  delete userObj.permissionOverrides; // sent separately below, no need to duplicate

  // ── FIX (Issue 5): strip token strings from session ─────────────────────
  const sessionObj = {
    id: session._id,
    browser: session.browser,
    os: session.os,
    deviceType: session.deviceType,
    ipAddress: session.ipAddress,
    lastActivityAt: session.lastActivityAt,
  };

  res.status(200).json({
    status: 'success',
    token: accessToken,
    data: {
      user: {
        ...userObj,
        isOwner,
        isSuperAdmin,
        permissions,
        role: user.role?.name,
        ...(
          (user.permissionOverrides?.granted?.length || user.permissionOverrides?.revoked?.length)
            ? { overrides: user.permissionOverrides }
            : {}
        ),
      },
      session: sessionObj,
      organization: {
        id: organization._id,
        name: organization.name,
        uniqueShopId: organization.uniqueShopId,
      },
    },
  });
});

// ======================================================
//  4. PROTECT MIDDLEWARE
// ======================================================
exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer'))
    token = req.headers.authorization.split(' ')[1];
  else if (req.cookies?.refreshToken)
    // Note: access token should come from Authorization header, not cookie.
    // refreshToken cookie is for /refresh-token endpoint only.
    token = null;

  if (!token)
    return next(new AppError('You are not logged in. Please log in to access this resource.', 401));

  // Verify JWT
  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ status: 'fail', message: 'Your session has expired. Please login again.', code: 'TOKEN_EXPIRED' });
    if (err.name === 'JsonWebTokenError')
      return res.status(401).json({ status: 'fail', message: 'Invalid token. Please login again.', code: 'INVALID_TOKEN' });
    return next(new AppError('Authentication failed.', 401));
  }

  const userId = decoded.id || decoded._id || decoded.sub;
  if (!userId) return next(new AppError('Invalid token payload.', 401));
  if (decoded.type && decoded.type !== 'merchant_user') {
    return next(new AppError('Invalid token type for merchant API.', 403));
  }

  const user = await User.findById(userId).populate({
    path: 'role',
    select: 'name permissions isSuperAdmin isActive',
  }).select('+permissionOverrides');

  if (!user)
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  if (user.isLoginBlocked)
    return next(new AppError(`Account blocked. Reason: ${user.blockReason || 'Administrative Action'}.`, 403));
  if (!user.isActive)
    return next(new AppError('User account is deactivated. Please contact administrator.', 401));
  if (user.status !== 'approved')
    return next(new AppError('Account not approved. Please contact administrator.', 401));

  // Session integrity — support current token OR recently-rotated previous token
  let session = await Session.findOne({ userId, token, isValid: true });

  if (!session) {
    // Grace-period check for token rotation (30s window)
    const rotatedSession = await Session.findOne({ userId, previousToken: token, isValid: true });

    if (rotatedSession) {
      const gracePeriod = 30 * 1000;
      const timeSinceRotation = Date.now() - (rotatedSession.lastTokenUpdateAt?.getTime() || 0);

      if (timeSinceRotation > gracePeriod)
        return next(new AppError('Session expired (token rotation grace period exceeded).', 401));

      session = rotatedSession;
    }
  }

  if (!session)
    return next(new AppError('Session expired or invalid. Please login again.', 401));

  // Password-changed-after-token check
  if (user.passwordChangedAt) {
    const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
    if (decoded.iat < changedTimestamp)
      return next(new AppError('User recently changed password. Please log in again.', 401));
  }

  const isSuperAdmin = user.role?.isSuperAdmin || user.isSuperAdmin || false;
  const isOwner = user.isOwner;

  const hydratedUser = await attachEmployeeRecord(user);

  req.user = {
    ...hydratedUser,
    id: user._id,
    isSuperAdmin,
    isOwner,
    permissions: (isOwner || isSuperAdmin) ? ['*'] : mergePermissions(user.role?.permissions, user.permissionOverrides),
    roleName: user.role?.name || 'No Role',
  };
  req.session = session;

  await Session.findByIdAndUpdate(session._id, { lastActivityAt: new Date() });

  next();
});

// ======================================================
//  5. PERMISSION MIDDLEWARES
// ======================================================

/** Role/permission gate — used by routes that don't use checkPermission middleware */
exports.restrictTo = (...permissions) => (req, res, next) => {
  if (!req.user) return next(new AppError('You are not logged in.', 401));

  if (req.user.isOwner || req.user.isSuperAdmin) return next();

  const hasPermission = permissions.some(p =>
    req.user.permissions.includes(p) || req.user.permissions.includes('*')
  );

  if (!hasPermission)
    return next(new AppError(
      `You don't have permission to perform this action. Required: ${permissions.join(' or ')}`, 403
    ));

  next();
};

exports.checkUserPermission = (permissionTag) => async (req, res, next) => {
  if (!req.user) return next(new AppError('User not authenticated', 401));

  if (req.user.isSuperAdmin || req.user.isOwner || req.user.permissions.includes('*'))
    return next();

  if (!req.user.permissions.includes(permissionTag))
    return next(new AppError(`You do not have permission: ${permissionTag}`, 403));

  next();
};

// ======================================================
//  6. TOKEN & SESSION VERIFICATION
// ======================================================

/**
 * @desc  Verify token validity + return user snapshot
 * @route GET /api/v1/auth/verify-token
 */
exports.verifyToken = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer'))
    token = req.headers.authorization.split(' ')[1];

  if (!token) return next(new AppError('No token provided', 401));

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  if (decoded.type && decoded.type !== 'merchant_user') {
    return next(new AppError('Invalid token type for merchant API.', 403));
  }

  const user = await User.findById(decoded.id)
    .populate('role')
    .select('+permissionOverrides');

  if (!user) return next(new AppError('User not found', 401));
  if (!user.isActive) return next(new AppError('User account is deactivated', 401));
  if (user.status !== 'approved') return next(new AppError('Account not approved', 401));
  if (user.isLoginBlocked) return next(new AppError('Account blocked', 403));

  let session = await Session.findOne({ userId: user._id, token, isValid: true });

  if (!session) {
    // Grace-period check for token rotation (same 30s window as protect middleware)
    const rotatedSession = await Session.findOne({ userId: user._id, previousToken: token, isValid: true });
    if (rotatedSession) {
      const gracePeriod = 30 * 1000;
      const timeSinceRotation = Date.now() - (rotatedSession.lastTokenUpdateAt?.getTime() || 0);
      if (timeSinceRotation <= gracePeriod) {
        session = rotatedSession;
      }
    }
  }

  if (!session) return next(new AppError('Session expired', 401));

  const hydratedUser = await attachEmployeeRecord(user);

  res.status(200).json({
    status: 'success',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isOwner: user.isOwner,
        isSuperAdmin: user.isSuperAdmin || user.role?.isSuperAdmin,
        permissions: (user.isOwner || user.isSuperAdmin || user.role?.isSuperAdmin)
          ? ['*']
          : mergePermissions(user.role?.permissions, user.permissionOverrides),
        organizationId: user.organizationId,
        branchId: user.branchId,
        avatar: user.avatar,
        employeeProfile: hydratedUser.employeeProfile,
        attendanceConfig: hydratedUser.attendanceConfig,
        employee: hydratedUser.employee,
      },
      session: {
        id: session._id,
        browser: session.browser,
        deviceType: session.deviceType,
        lastActivityAt: session.lastActivityAt,
      },
    },
  });
});

/**
 * @desc  Silent token refresh via HttpOnly refresh token cookie
 * @route POST /api/v1/auth/refresh-token
 */
exports.refreshToken = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken)
    return next(new AppError('No refresh token provided. Please login again.', 401));

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (err) {
    res.clearCookie('refreshToken', getCookieOptions());
    return next(new AppError(
      err.name === 'TokenExpiredError'
        ? 'Refresh token expired. Please login again.'
        : 'Invalid refresh token. Please login again.',
      401
    ));
  }

  const user = await User.findById(decoded.id).populate('role');

  if (!user) {
    res.clearCookie('refreshToken', getCookieOptions());
    return next(new AppError('User no longer exists.', 401));
  }

  if (!user.isActive || user.isLoginBlocked || user.status !== 'approved') {
    res.clearCookie('refreshToken', getCookieOptions());
    return next(new AppError('Account is not active. Please contact administrator.', 401));
  }

  const session = await Session.findOne({ userId: user._id, refreshToken, isValid: true });

  if (!session) {
    res.clearCookie('refreshToken', getCookieOptions());
    return next(new AppError('Session expired. Please login again.', 401));
  }

  // Optional: hard max session age (30 days)
  const maxSessionAge = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - session.createdAt.getTime() > maxSessionAge) {
    session.isValid = false;
    await session.save();
    res.clearCookie('refreshToken', getCookieOptions());
    return next(new AppError('Session expired. Please login again.', 401));
  }

  const isOwner = await Organization.exists({ _id: user.organizationId, owner: user._id });

  const newAccessToken = signAccessToken({
    id: user._id,
    organizationId: user.organizationId,
    isOwner: !!isOwner,
    isSuperAdmin: user.role?.isSuperAdmin || false,
  });

  // Token rotation with grace-period window
  session.previousToken = session.token;
  session.token = newAccessToken;
  session.lastTokenUpdateAt = new Date();
  session.lastActivityAt = new Date();
  await session.save();

  res.status(200).json({
    status: 'success',
    token: newAccessToken,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
});

// ======================================================
//  7. LOGOUT
// ======================================================

/**
 * @desc  Logout current session
 * @route POST /api/v1/auth/logout
 */
exports.logout = catchAsync(async (req, res, next) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  const refreshToken = req.cookies.refreshToken;

  if (req.user?.id && accessToken) {
    await Session.findOneAndUpdate(
      { userId: req.user.id, token: accessToken, isValid: true },
      { isValid: false, terminatedAt: new Date(), token: 'revoked', refreshToken: 'revoked' }
    );
  } else if (refreshToken) {
    await Session.findOneAndUpdate(
      { refreshToken, isValid: true },
      { isValid: false, terminatedAt: new Date(), token: 'revoked', refreshToken: 'revoked' }
    );
  } else if (req.user?.id) {
    // Last resort — invalidate all sessions
    await Session.updateMany(
      { userId: req.user.id, isValid: true },
      { isValid: false, terminatedAt: new Date(), token: 'revoked', refreshToken: 'revoked' }
    );
    await User.findByIdAndUpdate(req.user.id, { $set: { refreshTokens: [] } });
  }

  res.clearCookie('refreshToken', getCookieOptions());
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
});

/**
 * @desc  Logout from ALL devices
 * @route POST /api/v1/auth/logout-all
 */
exports.logoutAll = catchAsync(async (req, res, next) => {
  if (!req.user?.id) return next(new AppError('User not authenticated', 401));

  await Session.updateMany(
    { userId: req.user.id, isValid: true },
    { isValid: false, terminatedAt: new Date(), token: 'revoked', refreshToken: 'revoked' }
  );

  await User.findByIdAndUpdate(req.user.id, { $set: { refreshTokens: [] } });

  res.clearCookie('refreshToken', getCookieOptions());
  res.status(200).json({ status: 'success', message: 'Logged out from all devices successfully.' });
});

// ======================================================
//  8. PASSWORD MANAGEMENT
// ======================================================

/**
 * @desc  Forgot password — send reset email
 * @route POST /api/v1/auth/forgot-password
 */
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError('Please provide your email address.', 400));

  const user = await User.findOne({ email: email.toLowerCase() });

  // Always return 200 — prevents email enumeration
  if (!user) {
    return res.status(200).json({
      status: 'success',
      message: 'If an account exists with that email, a password reset link will be sent.',
    });
  }

  if (!user.isActive || user.isLoginBlocked || user.status !== 'approved')
    return next(new AppError('Account is not active. Please contact administrator.', 400));

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 min

  await user.save({ validateBeforeSave: false });

  const resetURL = `${process.env.FRONTEND_URL}/auth/resetpassword/${resetToken}`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Password Reset Request (Valid for 10 minutes)',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetURL}" style="padding:10px 20px;background:#4F46E5;color:white;text-decoration:none;border-radius:5px;">Reset Password</a></p>
        <p>Or copy this link: ${resetURL}</p>
        <p>This link will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr><p>Never share this link with anyone.</p>
      `,
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError('Failed to send reset email. Please try again later.', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'Password reset link sent to your email. Valid for 10 minutes.',
  });
});

/**
 * @desc  Reset password with token
 * @route PATCH /api/v1/auth/reset-password/:token
 */
exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  const { password, passwordConfirm } = req.body;

  if (!password || !passwordConfirm)
    return next(new AppError('Please provide password and password confirmation', 400));
  if (password !== passwordConfirm)
    return next(new AppError('Passwords do not match', 400));
  if (password.length < 8)
    return next(new AppError('Password must be at least 8 characters', 400));

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).populate('role').select('+permissionOverrides');

  if (!user) return next(new AppError('Password reset token is invalid or has expired.', 400));

  user.password = password;
  user.passwordConfirm = passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = Date.now() - 1000;
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  user.mustChangePassword = false;

  await user.save();

  // Invalidate all existing sessions
  await Session.updateMany(
    { userId: user._id, isValid: true },
    { isValid: false, terminatedAt: new Date(), token: 'revoked', refreshToken: 'revoked' }
  );
  user.refreshTokens = [];

  // Auto-login after reset
  const isOwner = await Organization.exists({ _id: user.organizationId, owner: user._id });

  const accessToken = signAccessToken({
    id: user._id,
    organizationId: user.organizationId,
    isOwner: !!isOwner,
    isSuperAdmin: user.role?.isSuperAdmin || false,
  });
  const refreshToken = signRefreshToken({ id: user._id });

  const { browser, os, device } = getDeviceInfo(req);

  const session = await Session.create({
    userId: user._id,
    token: accessToken,
    refreshToken,
    isValid: true,
    browser,
    os,
    deviceType: device,
    ipAddress: getClientIp(req),
    organizationId: user.organizationId,
    lastActivityAt: new Date(),
  });

  res.cookie('refreshToken', refreshToken, getCookieOptions());

  sendEmail({
    email: user.email,
    subject: 'Password Successfully Reset',
    html: `
      <h2>Password Reset Successful</h2>
      <p>Hello ${user.name},</p>
      <p>Your password has been successfully reset.</p>
      <p>If you did not perform this action, please contact your administrator immediately.</p>
    `,
  }).catch(err => logger.error('Password reset confirmation email failed:', err.message));

  // Fetch organization info for consistent response
  const organization = await Organization.findById(user.organizationId);

  const effectivePermissions = (isOwner || user.role?.isSuperAdmin || user.isSuperAdmin)
    ? ['*']
    : mergePermissions(user.role?.permissions, user.permissionOverrides);

  res.status(200).json({
    status: 'success',
    token: accessToken,
    message: 'Password reset successful. You are now logged in.',
    data: {
      user: {
        ...user.toObject(),
        isOwner,
        permissions: effectivePermissions,
      },
      session,
      organization: {
        id: organization?._id,
        name: organization?.name,
        uniqueShopId: organization?.uniqueShopId,
      },
    },
  });
});

/**
 * @desc  Update own password (when logged in)
 * @route PATCH /api/v1/auth/update-my-password
 */
exports.updateMyPassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword, newPasswordConfirm } = req.body;

  if (!currentPassword || !newPassword || !newPasswordConfirm)
    return next(new AppError('Please provide current password, new password and confirmation', 400));
  if (newPassword !== newPasswordConfirm)
    return next(new AppError('New passwords do not match', 400));
  if (newPassword.length < 8)
    return next(new AppError('Password must be at least 8 characters', 400));
  if (newPassword === currentPassword)
    return next(new AppError('New password must be different from current password', 400));

  const user = await User.findById(req.user.id).select('+password').populate('role');
  if (!user) return next(new AppError('User not found.', 404));

  if (!(await user.correctPassword(currentPassword, user.password)))
    return next(new AppError('Current password is incorrect.', 401));

  user.password = newPassword;
  user.passwordConfirm = newPasswordConfirm;
  user.passwordChangedAt = Date.now() - 1000;
  user.mustChangePassword = false;

  await user.save();

  // Invalidate ALL other sessions — force re-login on other devices
  await Session.updateMany(
    { userId: user._id, isValid: true, _id: { $ne: req.session?._id } },
    { isValid: false, terminatedAt: new Date(), token: 'revoked', refreshToken: 'revoked' }
  );

  // Issue fresh access token for the current session
  const isOwner = await Organization.exists({ _id: user.organizationId, owner: user._id });

  const newAccessToken = signAccessToken({
    id: user._id,
    organizationId: user.organizationId,
    isOwner: !!isOwner,
    isSuperAdmin: user.role?.isSuperAdmin || false,
  });

  // Update current session's stored token
  if (req.session) {
    req.session.token = newAccessToken;
    req.session.lastActivityAt = new Date();
    await req.session.save();
  }

  res.status(200).json({
    status: 'success',
    token: newAccessToken,
    message: 'Password updated successfully.',
  });
});

// ======================================================
//  9. EMAIL VERIFICATION
// ======================================================

/**
 * @desc  Send email verification link
 * @route POST /api/v1/auth/send-verification-email
 */
exports.sendVerificationEmail = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (user.emailVerified)
    return next(new AppError('Email already verified', 400));

  const verificationToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
  // No expiry was set originally — add one for security
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h

  await user.save({ validateBeforeSave: false });

  const verificationURL = `${process.env.FRONTEND_URL}/auth/verify-email/${verificationToken}`;

  await sendEmail({
    email: user.email,
    subject: 'Verify Your Email Address',
    html: `
      <h2>Email Verification</h2>
      <p>Hello ${user.name},</p>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="${verificationURL}" style="padding:10px 20px;background:#4F46E5;color:white;text-decoration:none;border-radius:5px;">Verify Email</a></p>
      <p>Or copy this link: ${verificationURL}</p>
      <p>This link will expire in 24 hours.</p>
    `,
  });

  res.status(200).json({ status: 'success', message: 'Verification email sent successfully.' });
});

/**
 * @desc  Verify email with token
 * @route GET /api/v1/auth/verify-email/:token
 */
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }, // enforce expiry
  });

  if (!user) return next(new AppError('Invalid or expired verification token', 400));

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({ status: 'success', message: 'Email verified successfully.' });
});

