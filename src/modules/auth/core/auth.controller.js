'use strict';

const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const UAParser = require("ua-parser-js");

const User = require("./user.model");
const Organization = require("../../organization/core/organization.model");
const Role = require("./role.model");
const Session = require("./session.model");

const catchAsync = require("../../../core/utils/api/catchAsync");
const AppError = require("../../../core/utils/api/appError");
const sendEmail = require("../../../core/infra/email");
const { signAccessToken, signRefreshToken } = require("../../../core/utils/helpers/authUtils");
const { createNotification } = require("../../notification/core/notification.service");
const { emitToUser } = require("../../../socketHandlers/socket");

// ======================================================
//  1. HELPERS
// ======================================================

const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown"
  );
};

const getDeviceInfo = (req) => {
  try {
    const parser = new UAParser(req.headers["user-agent"] || "");
    const browser = parser.getBrowser()?.name || "unknown";
    const os = parser.getOS()?.name || "unknown";
    const dev = parser.getDevice();
    const device = dev?.model || dev?.type || "unknown";
    return { browser, os, device };
  } catch {
    return { browser: "unknown", os: "unknown", device: "unknown" };
  }
};

/**
 * 🟢 SECURITY: Centralized Cookie Configuration
 * Ensures cookies work on Localhost (HTTP) and Production (HTTPS) automatically.
 */
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 Days
    httpOnly: true, // Prevents XSS (JavaScript cannot read this)
    secure: isProduction, // TRUE on Prod (HTTPS), FALSE on Localhost
    sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-site cookie, 'lax' for local dev
    path: '/'
  };
};

/**
 * 🟢 NEW: Validate phone number format (basic)
 */
const validatePhone = (phone) => {
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone);
};

/**
 * 🟢 NEW: Clean phone number (remove formatting for storage)
 */
const cleanPhone = (phone) => {
  return phone.replace(/[\s\-\(\)\+]/g, '');
};

// ======================================================
//  2. CORE AUTH ACTIONS
// ======================================================

/**
 * @desc    Sign up new user
 * @route   POST /api/v1/auth/signup
 * @access  Public
 */
/**
 * @desc    Sign up new user
 * @route   POST /api/v1/auth/signup
 * @access  Public
 */
exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, phone, uniqueShopId } = req.body;

  // 1. Validate required fields
  if (!name || !email || !password || !passwordConfirm || !uniqueShopId || !phone) {
    return next(new AppError("All fields including phone are required", 400));
  }

  // 2. Validate phone format
  if (!validatePhone(phone)) {
    return next(new AppError("Please provide a valid phone number", 400));
  }

  // 3. Find organization
  const organization = await Organization.findOne({ uniqueShopId }).populate("owner", "name email");
  if (!organization) {
    return next(new AppError("Invalid Shop ID", 404));
  }

  // 4. Clean phone for storage
  const cleanedPhone = cleanPhone(phone);

  // 5. Check for existing user with same email OR phone in this organization
  const existingUser = await User.findOne({
    organizationId: organization._id,
    $or: [
      { email: email.toLowerCase() },
      { phone: cleanedPhone }
    ]
  });

  if (existingUser) {
    if (existingUser.email === email.toLowerCase()) {
      if (existingUser.status === "pending") {
        return next(new AppError("Registration pending approval. Please check your email for status.", 400));
      }
      return next(new AppError("Email already registered in this organization.", 400));
    }
    if (existingUser.phone === cleanedPhone) {
      return next(new AppError("Phone number already registered in this organization.", 400));
    }
  }

  // 6. Create new user
  const newUser = await User.create({
    name,
    email: email.toLowerCase(),
    phone: cleanedPhone,
    password,
    passwordConfirm,
    organizationId: organization._id,
    status: "pending",
    isActive: true,
    isLoginBlocked: false,
    employeeProfile: {
      employmentType: 'permanent' // Initialize empty employee profile
    },
    attendanceConfig: {
      isAttendanceEnabled: true,
      allowWebPunch: false,
      allowMobilePunch: true,
      enforceGeoFence: false
    }
  });

  // 7. 🔔 NOTIFICATIONS
  if (organization.owner?._id) {
    const ownerId = organization.owner._id.toString();

    // Socket notification
    try {
      emitToUser(ownerId, "newNotification", {
        title: "New Signup Request",
        message: `${newUser.name} (${newUser.email}) has signed up.`,
        type: "info",
        createdAt: new Date().toISOString(),
      });
    } catch (socketErr) {
      console.error("Socket emission failed:", socketErr.message);
    }

    // DB Notification
    try {
      const io = req.app.get("io");
      await createNotification(
        organization._id,
        ownerId,
        "USER_SIGNUP", // ✅ This maps to your schema's required `businessType`
        "New Employee Signup Request",
        `${name} (${email}) is waiting for approval. Phone: ${phone}`,
        io
      );
    } catch (dbNotifyErr) {
      console.error("DB Notification creation failed:", dbNotifyErr.message);
    }

    // Email notification to Admin
    sendEmail({
      email: organization.owner.email,
      subject: "New Signup Request - Awaits Approval",
      html: `
        <h2>New Signup Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Organization:</strong> ${organization.name}</p>
        <p>Please login to the admin panel to approve or reject this request.</p>
        <a href="${process.env.FRONTEND_URL}/admin/users/pending">Review Request</a>
      `
    }).catch(err => console.error("Signup Email to admin failed:", err.message));
  }

  // 8. Send welcome email to user
  sendEmail({
    email: newUser.email,
    subject: "Registration Received - Awaiting Approval",
    html: `
      <h2>Welcome ${name}!</h2>
      <p>Your registration has been received and is awaiting approval from your organization administrator.</p>
      <p>You will receive another email once your account is approved.</p>
      <p><strong>Organization:</strong> ${organization.name}</p>
      <p><strong>Registered Email:</strong> ${email}</p>
      <p><strong>Registered Phone:</strong> ${phone}</p>
    `
  }).catch(err => console.error("Welcome Email to user failed:", err.message));

  // 9. Send Response
  res.status(201).json({
    status: "success",
    message: "Signup successful. Awaiting organization approval. You'll be notified via email once approved.",
    data: {
      email: newUser.email,
      name: newUser.name,
      status: newUser.status
    }
  });
});

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password, uniqueShopId } = req.body;

  // 1. Validation
  if (!email || !password || !uniqueShopId) {
    return next(new AppError("Email, password and Shop ID are required.", 400));
  }

  // 2. Organization Check
  const organization = await Organization.findOne({ uniqueShopId });
  if (!organization) {
    return next(new AppError("Invalid Shop ID.", 404));
  }

  // 3. User Lookup (with phone OR email support)
  const user = await User.findOne({
    organizationId: organization._id,
    $or: [
      { email: email.toLowerCase() },
      { phone: cleanPhone(email) } // Allow login with phone number too
    ]
  })
    .select("+password +loginAttempts +lockUntil")
    .populate({ path: "role", select: "name permissions isSuperAdmin isActive" });

  // Check if user exists
  if (!user) {
    return next(new AppError("Invalid credentials.", 401));
  }

  // Check if account is locked
  if (user.isLocked && user.isLocked()) {
    const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return next(new AppError(`Account temporarily locked. Try again in ${lockTimeRemaining} minutes.`, 423));
  }

  // Verify password
  const isPasswordCorrect = await user.correctPassword(password, user.password);

  if (!isPasswordCorrect) {
    // Increment login attempts
    await user.incrementLoginAttempts();

    // Get updated user to check if now locked
    const updatedUser = await User.findById(user._id).select("+loginAttempts +lockUntil");

    if (updatedUser.lockUntil && updatedUser.lockUntil > Date.now()) {
      return next(new AppError(`Too many failed attempts. Account locked for 2 hours.`, 423));
    }

    return next(new AppError("Invalid credentials.", 401));
  }

  // ---------------------------------------------------------
  // 🔴 SECURITY: Kill Switch & Status Logic
  // ---------------------------------------------------------

  // Check if account is blocked
  if (user.isLoginBlocked) {
    return next(new AppError(
      `Access Denied: Account blocked. Reason: ${user.blockReason || 'Administrative Action'}. 
      Please contact your organization administrator.`, 403
    ));
  }

  // Check status
  if (user.status !== "approved") {
    const statusMessages = {
      'pending': 'Account awaiting approval from organization administrator.',
      'rejected': 'Account registration was rejected. Please contact administrator.',
      'inactive': 'Account is inactive.',
      'suspended': 'Account has been suspended.'
    };
    return next(new AppError(statusMessages[user.status] || 'Account not approved.', 401));
  }

  // Check if active
  if (!user.isActive) {
    return next(new AppError("Account is deactivated. Please contact administrator.", 401));
  }

  // Check if email verified (if required)
  if (!user.emailVerified && process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
    return next(new AppError("Please verify your email before logging in.", 401));
  }

  // Reset login attempts on successful login
  if (user.loginAttempts > 0) {
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save({ validateBeforeSave: false });
  }

  // ---------------------------------------------------------
  // 🔴 SECURITY: Dynamic Session Concurrency Control
  // ---------------------------------------------------------

  // 1. Check for active sessions
  const activeSessions = await Session.find({ userId: user._id, isValid: true });
  const maxSessions = user.maxConcurrentSessions || 1;

  // 2. Determine if we need to block for confirmation
  if (activeSessions.length >= maxSessions && !req.body.forceLogout) {
    return res.status(409).json({
      status: "fail",
      code: "SESSION_CONCURRENCY_LIMIT",
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
          lastActivity: s.lastActivityAt
        }))
      }
    });
  }

  // 3. Handle session invalidation (only if forceLogout is requested or we're strictly enforcing 1-session default)
  if (req.body.forceLogout || maxSessions === 1) {
    // Invalidate All Sessions for this user
    await Session.updateMany(
      { userId: user._id, isValid: true },
      {
        isValid: false,
        terminatedAt: new Date(),
        // 🔴 SECURITY: Nullify the physical tokens to prevent any accidental reuse
        token: "revoked",
        refreshToken: "revoked"
      }
    );

    // Also clear the legacy refreshTokens array if it exists
    user.refreshTokens = [];
  }

  // Determine if user is owner
  const isOwner = organization.owner.toString() === user._id.toString();

  // Generate tokens
  const accessToken = signAccessToken({
    id: user._id,
    organizationId: user.organizationId,
    isOwner,
    isSuperAdmin: user.role?.isSuperAdmin || false
  });

  const refreshToken = signRefreshToken({ id: user._id });

  // Get device info
  const { browser, os, device } = getDeviceInfo(req);

  // Create session
  const session = await Session.create({
    userId: user._id,
    token: accessToken,
    refreshToken: refreshToken,
    isValid: true,
    browser,
    os,
    deviceType: device,
    ipAddress: getClientIp(req),
    organizationId: user.organizationId,
    lastActivityAt: new Date()
  });

  // Set cookie
  res.cookie('refreshToken', refreshToken, getCookieOptions());

  // Update last login
  user.lastLoginAt = new Date();
  user.lastLoginIP = getClientIp(req);

  // Add device to devices array if new
  const deviceExists = user.devices?.some(d =>
    d.deviceId === req.headers['x-device-id'] ||
    (d.userAgent === req.headers['user-agent'] && d.deviceType === device)
  );

  if (!deviceExists && req.headers['user-agent']) {
    user.devices = user.devices || [];
    user.devices.push({
      deviceId: req.headers['x-device-id'] || crypto.randomBytes(16).toString('hex'),
      deviceType: device.includes('mobile') ? 'mobile' : (device.includes('tablet') ? 'tablet' : 'web'),
      lastActive: new Date(),
      userAgent: req.headers['user-agent']
    });

    // Keep only last 10 devices
    if (user.devices.length > 10) {
      user.devices = user.devices.slice(-10);
    }
  }

  await user.save({ validateBeforeSave: false });

  // Sanitize user output
  user.password = undefined;
  user.loginAttempts = undefined;
  user.lockUntil = undefined;
  user.refreshTokens = undefined;

  res.status(200).json({
    status: "success",
    token: accessToken,
    data: {
      user: {
        ...user.toObject(),
        isOwner
      },
      session,
      organization: {
        id: organization._id,
        name: organization.name,
        uniqueShopId: organization.uniqueShopId
      }
    }
  });
});

// ======================================================
//  3. MIDDLEWARE
// ======================================================

/**
 * @desc    Protect routes - authentication middleware
 */
exports.protect = catchAsync(async (req, res, next) => {
  let token;

  // Extract token from Authorization header or cookie
  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError("You are not logged in. Please log in to access this resource.", 401));
  }

  // Verify token
  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'fail',
        message: 'Your session has expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid token. Please login again.',
        code: 'INVALID_TOKEN'
      });
    }
    return next(new AppError("Authentication failed.", 401));
  }

  const userId = decoded.id || decoded._id || decoded.sub;
  if (!userId) {
    return next(new AppError("Invalid token payload.", 401));
  }

  // Parallel Fetch for Speed
  const [user] = await Promise.all([
    User.findById(userId).populate({
      path: 'role',
      select: 'name permissions isSuperAdmin isActive'
    })
  ]);

  // 1. User Integrity Checks
  if (!user) {
    return next(new AppError("The user belonging to this token no longer exists.", 401));
  }

  // 🔴 SECURITY: Kill Switch Check
  if (user.isLoginBlocked) {
    return next(new AppError(
      `Account blocked. Reason: ${user.blockReason || 'Administrative Action'}. Please contact administrator.`,
      403
    ));
  }

  // Check if user is active
  if (!user.isActive) {
    return next(new AppError("User account is deactivated. Please contact administrator.", 401));
  }

  // Check status
  if (user.status !== "approved") {
    return next(new AppError("Account not approved. Please contact administrator.", 401));
  }

  // 2. Session Integrity Check
  // We check for the current token OR the previous token (if rotated within last 30 seconds)
  let session = await Session.findOne({
    userId,
    token,
    isValid: true
  });

  if (!session) {
    // Check if it's a recently rotated token
    session = await Session.findOne({
      userId,
      previousToken: token,
      isValid: true
    });

    if (session) {
      const gracePeriod = 30 * 1000; // 30 seconds
      const timeSinceUpdate = Date.now() - (session.lastTokenUpdateAt?.getTime() || 0);

      if (timeSinceUpdate > gracePeriod) {
        return next(new AppError("Session expired (token rotation grace period exceeded).", 401));
      }
      // Success! Using a valid previous token within the grace period.
    }
  }

  if (!session) {
    return next(new AppError("Session expired or invalid. Please login again.", 401));
  }

  // Check if password was changed after token was issued
  if (user.passwordChangedAt) {
    const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
    if (decoded.iat < changedTimestamp) {
      return next(new AppError("User recently changed password. Please log in again.", 401));
    }
  }

  // Prepare user object for request
  const userObj = user.toObject();
  req.user = {
    ...userObj,
    id: user._id,
    isSuperAdmin: user.role?.isSuperAdmin || user.isSuperAdmin || false,
    permissions: user.role?.permissions || [],
    roleName: user.role?.name || 'No Role'
  };

  req.session = session;

  // Update last activity (Awaited to prevent unhandled rejections)
  await Session.findByIdAndUpdate(session._id, { lastActivityAt: new Date() });

  next();
});

/**
 * @desc    Restrict access based on permissions
 */
exports.restrictTo = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("You are not logged in.", 401));
    }

    const { isSuperAdmin, permissions: userPerms } = req.user;

    // Owners and SuperAdmins bypass everything
    if (req.user.isOwner || isSuperAdmin) {
      return next();
    }

    // Check for specific permission or wildcard
    const hasPermission = permissions.some((p) =>
      userPerms.includes(p) || userPerms.includes("*")
    );

    if (!hasPermission) {
      return next(new AppError(
        `You don't have permission to perform this action. Required: ${permissions.join(' or ')}`,
        403
      ));
    }

    next();
  };
};

/**
 * @desc    Check specific user permission
 */
exports.checkUserPermission = (permissionTag) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new AppError("User not authenticated", 401));
    }

    // SuperAdmin and Owner override
    if (req.user.isSuperAdmin || req.user.isOwner || req.user.permissions.includes("*")) {
      return next();
    }

    const hasPermission = req.user.permissions.includes(permissionTag);
    if (!hasPermission) {
      return next(new AppError(`You do not have permission: ${permissionTag}`, 403));
    }

    next();
  };
};

// ======================================================
//  4. TOKEN & SESSION VERIFICATION
// ======================================================

/**
 * @desc    Verify token validity
 * @route   GET /api/v1/auth/verify-token
 * @access  Private
 */
exports.verifyToken = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError("No token provided", 401));
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  const user = await User.findById(decoded.id)
    .populate("role")
    .select("-refreshTokens -passwordResetToken -passwordResetExpires");

  // 🟢 SECURITY CHECKS
  if (!user) {
    return next(new AppError("User not found", 401));
  }

  if (!user.isActive) {
    return next(new AppError("User account is deactivated", 401));
  }

  if (user.status !== "approved") {
    return next(new AppError("Account not approved", 401));
  }

  if (user.isLoginBlocked) {
    return next(new AppError("Account blocked", 403));
  }

  // Check if session exists
  const session = await Session.findOne({ userId: user._id, token, isValid: true });
  if (!session) {
    return next(new AppError("Session expired", 401));
  }

  return res.status(200).json({
    status: "success",
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role?.name ?? null,
        permissions: user.role?.permissions ?? [],
        isOwner: user.isOwner,
        isSuperAdmin: user.isSuperAdmin || user.role?.isSuperAdmin,
        organizationId: user.organizationId,
        branchId: user.branchId,
        avatar: user.avatar,
        employeeProfile: user.employeeProfile
      },
      session: {
        id: session._id,
        browser: session.browser,
        deviceType: session.deviceType,
        lastActivityAt: session.lastActivityAt
      }
    },
  });
});

/**
 * @desc    Refresh access token using refresh token
 * @route   POST /api/v1/auth/refresh-token
 * @access  Public (with refresh token)
 */
exports.refreshToken = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  // 1. Check if token exists
  if (!refreshToken) {
    return next(new AppError("No refresh token provided. Please login again.", 401));
  }

  // 2. Verify refresh token
  let decoded;
  try {
    decoded = await promisify(jwt.verify)(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (err) {
    // If token is invalid/expired, clear it
    res.clearCookie("refreshToken", getCookieOptions());

    if (err.name === 'TokenExpiredError') {
      return next(new AppError("Refresh token expired. Please login again.", 401));
    }
    return next(new AppError("Invalid refresh token. Please login again.", 401));
  }

  // 3. Check if User still exists
  const user = await User.findById(decoded.id).populate('role');

  if (!user) {
    res.clearCookie("refreshToken", getCookieOptions());
    return next(new AppError("User no longer exists.", 401));
  }

  // 4. Check user status
  if (!user.isActive || user.isLoginBlocked || user.status !== "approved") {
    res.clearCookie("refreshToken", getCookieOptions());
    return next(new AppError("Account is not active. Please contact administrator.", 401));
  }

  // 5. Validate DB Session matches Refresh Token
  const session = await Session.findOne({
    userId: user._id,
    refreshToken,
    isValid: true
  });

  if (!session) {
    res.clearCookie("refreshToken", getCookieOptions());
    return next(new AppError("Session expired. Please login again.", 401));
  }

  // 6. Check if session is not too old (optional - 30 days max)
  const sessionAge = Date.now() - session.createdAt.getTime();
  const maxSessionAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  if (sessionAge > maxSessionAge) {
    session.isValid = false;
    await session.save();
    res.clearCookie("refreshToken", getCookieOptions());
    return next(new AppError("Session expired. Please login again.", 401));
  }

  // 7. Issue new Access Token
  const isOwner = await Organization.exists({
    _id: user.organizationId,
    owner: user._id
  });

  const userForToken = {
    id: user._id,
    organizationId: user.organizationId,
    role: user.role?._id,
    isSuperAdmin: user.role?.isSuperAdmin || false
  };

  const newAccessToken = signAccessToken(userForToken);

  // 🟢 ENHANCED: Token Rotation with Grace Period
  // Move current token to previousToken and set current to newAccessToken
  session.previousToken = session.token;
  session.token = newAccessToken;
  session.lastTokenUpdateAt = new Date();
  session.lastActivityAt = new Date();

  await session.save();

  res.status(200).json({
    status: "success",
    token: newAccessToken,
    expiresIn: process.env.JWT_EXPIRES_IN || '90d'
  });
});

/**
 * @desc    Logout user - invalidate session
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
exports.logout = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;
  const accessToken = req.headers.authorization?.split(" ")[1];

  // Invalidate current session if we have identifiers
  if (req.user?.id && accessToken) {
    await Session.findOneAndUpdate(
      { userId: req.user.id, token: accessToken, isValid: true },
      { isValid: false, terminatedAt: new Date() }
    );
  } else if (refreshToken) {
    // Fallback if req.user is missing but cookie exists
    await Session.findOneAndUpdate(
      { refreshToken, isValid: true },
      { isValid: false, terminatedAt: new Date() }
    );
  } else if (req.user?.id) {
    // Invalidate all sessions for this user (optional - security)
    await Session.updateMany(
      { userId: req.user.id, isValid: true },
      {
        isValid: false,
        terminatedAt: new Date(),
        token: "revoked",
        refreshToken: "revoked"
      }
    );

    // Also clear legacy tokens
    const User = require("./user.model");
    await User.findByIdAndUpdate(req.user.id, { $set: { refreshTokens: [] } });
  }

  // Clear cookie
  res.clearCookie("refreshToken", getCookieOptions());

  res.status(200).json({
    status: "success",
    message: "Logged out successfully."
  });
});

/**
 * @desc    Logout from all devices
 * @route   POST /api/v1/auth/logout-all
 * @access  Private
 */
exports.logoutAll = catchAsync(async (req, res, next) => {
  if (!req.user?.id) {
    return next(new AppError("User not authenticated", 401));
  }

  // Invalidate all sessions for this user
  await Session.updateMany(
    { userId: req.user.id, isValid: true },
    {
      isValid: false,
      terminatedAt: new Date(),
      token: "revoked",
      refreshToken: "revoked"
    }
  );

  // Clear legacy tokens
  const User = require("./user.model");
  await User.findByIdAndUpdate(req.user.id, { $set: { refreshTokens: [] } });

  // Clear cookie
  res.clearCookie("refreshToken", getCookieOptions());

  res.status(200).json({
    status: "success",
    message: "Logged out from all devices successfully."
  });
});

// ======================================================
//  5. PASSWORD MANAGEMENT
// ======================================================

/**
 * @desc    Forgot password - send reset email
 * @route   POST /api/v1/auth/forgot-password
 * @access  Public
 */
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError("Please provide your email address.", 400));
  }

  // Find user by email (across any organization)
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    // For security, don't reveal that user doesn't exist
    return res.status(200).json({
      status: "success",
      message: "If an account exists with that email, a password reset link will be sent."
    });
  }

  // Check if account is active
  if (!user.isActive || user.isLoginBlocked || user.status !== "approved") {
    return next(new AppError("Account is not active. Please contact administrator.", 400));
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token and save to DB
  user.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  await user.save({ validateBeforeSave: false });

  // Create reset URL
  const resetURL = `${process.env.FRONTEND_URL}/auth/resetpassword/${resetToken}`;

  // Send email
  try {
    await sendEmail({
      email: user.email,
      subject: "Password Reset Request (Valid for 10 minutes)",
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <p><a href="${resetURL}" style="padding: 10px 20px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
        <p>Or copy this link: ${resetURL}</p>
        <p>This link will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr>
        <p>For security, never share this link with anyone.</p>
      `
    });
  } catch (err) {
    // If email fails, clear reset token
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new AppError("Failed to send reset email. Please try again later.", 500));
  }

  res.status(200).json({
    status: "success",
    message: "Password reset link sent to your email. Valid for 10 minutes."
  });
});

/**
 * @desc    Reset password with token
 * @route   PATCH /api/v1/auth/reset-password/:token
 * @access  Public
 */
exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  const { password, passwordConfirm } = req.body;

  if (!password || !passwordConfirm) {
    return next(new AppError("Please provide password and password confirmation", 400));
  }

  if (password !== passwordConfirm) {
    return next(new AppError("Passwords do not match", 400));
  }

  // Hash the token from URL to compare with DB
  const hashedToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  // Find user with valid reset token
  // const user = await User.findOne({
  //   passwordResetToken: hashedToken,
  //   passwordResetExpires: { $gt: Date.now() },
  // });
  // Around line 545
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).populate("role"); // ✅ ADD THIS
  if (!user) {
    return next(new AppError("Password reset token is invalid or has expired.", 400));
  }

  // Update password
  user.password = password;
  user.passwordConfirm = passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = Date.now() - 1000; // Subtract 1 second to ensure token is issued after password change

  // Reset login attempts if any
  user.loginAttempts = 0;
  user.lockUntil = undefined;

  await user.save();

  // Invalidate all existing sessions for security
  await Session.updateMany(
    { userId: user._id, isValid: true },
    {
      isValid: false,
      terminatedAt: new Date(),
      token: "revoked",
      refreshToken: "revoked"
    }
  );

  // Clear legacy tokens
  user.refreshTokens = [];

  // Generate new tokens
  const isOwner = await Organization.exists({
    _id: user.organizationId,
    owner: user._id
  });

  const accessToken = signAccessToken({
    id: user._id,
    organizationId: user.organizationId,
    isOwner,
    isSuperAdmin: user.role?.isSuperAdmin || false
  });

  const refreshToken = signRefreshToken({ id: user._id });

  // Create new session
  const session = await Session.create({
    userId: user._id,
    token: accessToken,
    refreshToken: refreshToken,
    isValid: true,
    browser: "unknown",
    os: "unknown",
    deviceType: "web",
    ipAddress: getClientIp(req),
    organizationId: user.organizationId,
    lastActivityAt: new Date()
  });

  // Set cookie
  res.cookie('refreshToken', refreshToken, getCookieOptions());

  // Send confirmation email
  sendEmail({
    email: user.email,
    subject: "Password Successfully Reset",
    html: `
      <h2>Password Reset Successful</h2>
      <p>Hello ${user.name},</p>
      <p>Your password has been successfully reset.</p>
      <p>If you did not perform this action, please contact your administrator immediately.</p>
    `
  }).catch(err => console.error("Password reset confirmation email failed:", err.message));

  res.status(200).json({
    status: "success",
    token: accessToken,
    message: "Password reset successful. You are now logged in.",
    data: { session }
  });
});

/**
 * @desc    Update my password (when logged in)
 * @route   PATCH /api/v1/auth/update-my-password
 * @access  Private
 */
exports.updateMyPassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword, newPasswordConfirm } = req.body;

  if (!currentPassword || !newPassword || !newPasswordConfirm) {
    return next(new AppError("Please provide current password, new password and confirmation", 400));
  }

  if (newPassword !== newPasswordConfirm) {
    return next(new AppError("New passwords do not match", 400));
  }

  // Get user with password
  // const user = await User.findById(req.user.id).select("+password");
  // Around line 621
  const user = await User.findById(req.user.id)
    .select("+password")
    .populate("role"); // ✅ ADD THIS

  if (!user) {
    return next(new AppError("User not found.", 404));
  }

  // Verify current password
  if (!(await user.correctPassword(currentPassword, user.password))) {
    return next(new AppError("Current password is incorrect.", 401));
  }

  // Update password
  user.password = newPassword;
  user.passwordConfirm = newPasswordConfirm;
  user.passwordChangedAt = Date.now() - 1000;

  await user.save();

  // Invalidate all other sessions except current one
  if (req.session?._id) {
    await Session.updateMany(
      {
        userId: user._id,
        isValid: true,
        _id: { $ne: req.session._id }
      },
      {
        isValid: false,
        terminatedAt: new Date(),
        token: "revoked",
        refreshToken: "revoked"
      }
    );

    // Clear legacy tokens (except current one)
    user.refreshTokens = user.refreshTokens?.filter(t => t === req.session.refreshToken) || [];
  }

  // Generate new token
  const isOwner = await Organization.exists({
    _id: user.organizationId,
    owner: user._id
  });

  const accessToken = signAccessToken({
    id: user._id,
    organizationId: user.organizationId,
    isOwner,
    isSuperAdmin: user.role?.isSuperAdmin || false
  });

  // Update current session token
  if (req.session) {
    req.session.token = accessToken;
    await req.session.save();
  }

  res.status(200).json({
    status: "success",
    token: accessToken,
    message: "Password updated successfully."
  });
});

// ======================================================
//  6. EMAIL VERIFICATION
// ======================================================

/**
 * @desc    Send email verification
 * @route   POST /api/v1/auth/send-verification-email
 * @access  Private
 */
exports.sendVerificationEmail = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (user.emailVerified) {
    return next(new AppError("Email already verified", 400));
  }

  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');

  user.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  await user.save({ validateBeforeSave: false });

  // Create verification URL
  const verificationURL = `${process.env.FRONTEND_URL}/auth/verify-email/${verificationToken}`;

  // Send email
  await sendEmail({
    email: user.email,
    subject: "Verify Your Email Address",
    html: `
      <h2>Email Verification</h2>
      <p>Hello ${user.name},</p>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="${verificationURL}" style="padding: 10px 20px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
      <p>Or copy this link: ${verificationURL}</p>
      <p>This link will expire in 24 hours.</p>
    `
  });

  res.status(200).json({
    status: "success",
    message: "Verification email sent successfully."
  });
});

/**
 * @desc    Verify email with token
 * @route   GET /api/v1/auth/verify-email/:token
 * @access  Public
 */
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const { token } = req.params;

  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken
  });

  if (!user) {
    return next(new AppError("Invalid or expired verification token", 400));
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: "success",
    message: "Email verified successfully."
  });
});
