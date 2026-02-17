'use strict';

const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const UAParser = require("ua-parser-js");

const User = require("./user.model");
const Organization = require("../../organization/core/organization.model");
const Role = require("./role.model"); // Ensure this path is correct relative to your structure
const Session = require("./session.model");

const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const sendEmail = require("../../../core/utils/_legacy/email");
const { signAccessToken, signRefreshToken } = require("../../../core/utils/authUtils");
const { createNotification } = require("../../notification/core/notification.service");
const { emitToUser } = require("../../../core/utils/_legacy/socket");

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
    sameSite: isProduction ? 'none' : 'lax' // 'none' for cross-site cookie, 'lax' for local dev
  };
};

// ======================================================
//  2. CORE AUTH ACTIONS
// ======================================================

exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

  if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
    return next(new AppError("All fields are required", 400));

  const organization = await Organization.findOne({ uniqueShopId }).populate("owner", "name email");
  if (!organization) return next(new AppError("Invalid Shop ID", 404));

  const existingUser = await User.findOne({ email: email.toLowerCase(), organizationId: organization._id });
  if (existingUser) {
    if (existingUser.status === "pending") return next(new AppError("Registration pending approval.", 400));
    return next(new AppError("You are already registered in this organization.", 400));
  }

  const newUser = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    passwordConfirm,
    organizationId: organization._id,
    status: "pending",
  });

  // 🔔 NOTIFICATIONS
  if (organization.owner?._id) {
    const ownerId = organization.owner._id.toString();
    
    // Socket
    emitToUser(ownerId, "newNotification", {
      title: "New Signup Request",
      message: `${newUser.name} has signed up.`,
      type: "info",
      createdAt: new Date().toISOString(),
    });

    // DB Notification
    const io = req.app.get("io");
    await createNotification(
      organization._id,
      ownerId,
      "USER_SIGNUP",
      "New Employee Signup Request",
      `${name} (${email}) is waiting for approval.`,
      io,
    );

    // Email
    sendEmail({
      email: organization.owner.email,
      subject: "New Signup Request",
      message: `${name} (${email}) requested to join your organization.`,
    }).catch(err => console.error("Signup Email failed:", err.message));
  }

  res.status(201).json({
    status: "success",
    message: "Signup successful. Awaiting approval.",
  });
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password, uniqueShopId } = req.body;

  // 1. Validation
  if (!email || !password || !uniqueShopId)
    return next(new AppError("Email, password and Shop ID are required.", 400));

  // 2. Organization Check
  const organization = await Organization.findOne({ uniqueShopId });
  if (!organization) return next(new AppError("Invalid Shop ID.", 404));

  // 3. User Lookup
  const user = await User.findOne({ email: email.toLowerCase(), organizationId: organization._id })
    .select("+password")
    .populate({ path: "role", select: "name permissions isSuperAdmin isActive" });

  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError("Invalid credentials.", 401));

  // ---------------------------------------------------------
  // 🔴 SECURITY: Kill Switch & Status Logic
  // ---------------------------------------------------------
  
  if (user.isLoginBlocked) {
    return next(new AppError(`Access Denied: Account blocked. Reason: ${user.blockReason || 'Administrative Action'}`, 403));
  }

  if (user.status !== "approved") {
    const msg = user.status === 'pending' ? 'Account awaiting approval.' : 'Account rejected or inactive.';
    return next(new AppError(msg, 401));
  }

  if (!user.isActive) {
      return next(new AppError("Account is deactivated.", 401));
  }

  // 4. Invalidate old sessions (Your Concurrency Fix)
  await Session.updateMany({ userId: user._id, isValid: true }, { isValid: false });

  const isOwner = organization.owner.toString() === user._id.toString();

  // 5. Generate Tokens
  const accessToken = signAccessToken({
    id: user._id,
    organizationId: user.organizationId,
    isOwner,
    isSuperAdmin: user.role?.isSuperAdmin || false
  });

  const refreshToken = signRefreshToken({ id: user._id });

  // 6. Create Session
  const { browser, os, device } = getDeviceInfo(req);
  const session = await Session.create({
    userId: user._id,
    token: accessToken,    // Active Access Token
    refreshToken: refreshToken, // 🟢 Store Refresh Token (Crucial for validation)
    isValid: true,
    browser, os, deviceType: device,
    ipAddress: getClientIp(req),
    organizationId: user.organizationId,
  });

  // 7. Send Cookie
  res.cookie('refreshToken', refreshToken, getCookieOptions());

  // 8. Send Response
  user.password = undefined; // Sanitize
  res.status(200).json({
    status: "success",
    token: accessToken,
    data: { user, session, uniqueShopId }
  });
});

// ======================================================
//  3. MIDDLEWARE
// ======================================================

exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) return next(new AppError("Not authenticated.", 401));

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (err) {
    // 🟢 FRONTEND HOOK: Specific error code for interceptors
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'fail',
        message: 'jwt expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    return next(new AppError("Invalid token.", 401));
  }

  const userId = decoded.id || decoded._id || decoded.sub;
  if (!userId) return next(new AppError("Invalid token payload.", 401));

  // Parallel Fetch for Speed
  const [user, session] = await Promise.all([
    User.findById(userId).populate({ 
      path: 'role', 
      select: 'name permissions isSuperAdmin isActive' 
    }),
    Session.findOne({ userId, token, isValid: true })
  ]);

  // 1. User Integrity Checks
  if (!user) return next(new AppError("User no longer exists.", 401));
  
  // 🔴 SECURITY: Kill Switch Check
  if (user.isLoginBlocked) return next(new AppError("Account blocked.", 403));
  if (!user.isActive) return next(new AppError("User account is deactivated.", 401));
  
  // 2. Session Integrity Check
  if (!session) return next(new AppError("Session revoked or expired. Please login again.", 401));

  if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat)) {
    return next(new AppError("Password was recently changed. Please login again.", 401));
  }

  const userObj = user.toObject();
  req.user = {
    ...userObj,
    isSuperAdmin: user.role?.isSuperAdmin || user.isSuperAdmin || false,
    permissions: user.role?.permissions || [],
    roleName: user.role?.name || 'No Role'
  };

  req.session = session;

  // Fire-and-forget last activity update
  Session.findByIdAndUpdate(session._id, { lastActivityAt: new Date() }).exec();

  next();
});

exports.restrictTo = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) return next(new AppError("Not authorized.", 403));
    const { isSuperAdmin, permissions: userPerms } = req.user;
    
    // Owners and SuperAdmins bypass everything
    if (req.user.isOwner || isSuperAdmin) return next();
    if (permissions.includes("superadmin") && isSuperAdmin) return next();
    
    // Check for specific permission or wildcard
    const ok = permissions.some((p) => userPerms.includes(p) || userPerms.includes("*"));
    if (!ok) return next(new AppError("Permission denied.", 403));
    
    next();
  };
};

exports.checkUserPermission = (permissionTag) => {
  return async (req, res, next) => {
    if (!req.user) return next(new AppError("User not authenticated", 401));

    // SuperAdmin override
    if (req.user.isSuperAdmin || req.user.permissions.includes("*")) {
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

exports.verifyToken = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer")) token = req.headers.authorization.split(" ")[1];
  else if (req.cookies?.jwt) token = req.cookies.jwt;

  if (!token) return next(new AppError("No token provided", 401));

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).populate("role");
  
  // 🟢 SECURITY CHECKS
  if (!user || !user.isActive || user.status !== "approved") return next(new AppError("User invalid", 401));
  if (user.isLoginBlocked) return next(new AppError("Account blocked", 403));

  return res.status(200).json({
    status: "success",
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role?.name ?? null,
        permissions: user.role?.permissions ?? [],
      },
    },
  });
});

exports.refreshToken = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  // 1. Check if token exists
  if (!refreshToken) {
    return next(new AppError("No refresh token provided", 401));
  }

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (err) {
    // 🟢 FIX: If token is invalid/expired, clear it so frontend stops sending it
    res.clearCookie("refreshToken", getCookieOptions());
    return next(new AppError("Invalid refresh token", 401));
  }

  // 2. Check if User still exists
  const user = await User.findById(decoded.id).populate('role');
  
  if (!user || !user.isActive || user.isLoginBlocked) {
    // 🟢 CRITICAL FIX: The user is gone or banned. Force browser to delete the cookie.
    res.clearCookie("refreshToken", getCookieOptions());
    return next(new AppError("User no longer exists or blocked", 401));
  }

  // 3. 🟢 SECURITY: Validate DB Session matches Refresh Token
  const sessionExists = await Session.findOne({ userId: user._id, isValid: true });
  
  if (!sessionExists) {
    res.clearCookie("refreshToken", getCookieOptions());
    return next(new AppError("Session expired. Please login again.", 401));
  }

  // 4. Issue new Access Token
  const userForToken = {
    id: user._id,
    organizationId: user.organizationId,
    role: user.role?._id,
    isSuperAdmin: user.role?.isSuperAdmin || false
  };

  const newAccessToken = signAccessToken(userForToken);
  
  // Update session with new access token
  sessionExists.token = newAccessToken;
  await sessionExists.save();

  res.status(200).json({ status: "success", token: newAccessToken });
});

exports.logout = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;
  
  // If we have a refresh token, we can just invalidate that specific session
  // Logic from your code: Invalidate all for user (Concurrency Fix)
  // If you want to keep your "invalidate all" logic:
  if (req.user?.id) {
    await Session.updateMany({ userId: req.user.id, isValid: true }, { isValid: false });
  } else if (refreshToken) {
      // Fallback if req.user is missing but cookie exists
      await Session.findOneAndUpdate({ refreshToken }, { isValid: false });
  }

  res.clearCookie("refreshToken", getCookieOptions());
  res.status(200).json({ status: "success", message: "Logged out successfully." });
});

// ======================================================
//  5. PASSWORD MANAGEMENT
// ======================================================

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError("Email is required.", 400));

  const user = await User.findOne({ email });
  if (!user) return next(new AppError("No user with that email.", 404));

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const url = (process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`) + `/auth/reset-password/${resetToken}`;

  try {
    await sendEmail({
      email: user.email,
      subject: "Password Reset Link",
      message: `Reset your password here: ${url}`,
    });
  } catch {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError("Failed to send email.", 500));
  }

  res.status(200).json({ status: "success", message: "Password reset email sent." });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) return next(new AppError("Token invalid or expired.", 400));

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // For reset, we utilize a helper to send new token
  const accessToken = signAccessToken({ id: user._id, organizationId: user.organizationId });
  res.status(200).json({ status: "success", token: accessToken, data: { user } });
});

exports.updateMyPassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("+password");
  if (!user) return next(new AppError("User not found.", 404));

  if (!(await user.correctPassword(req.body.currentPassword, user.password)))
    return next(new AppError("Incorrect current password.", 401));

  user.password = req.body.newPassword;
  user.passwordConfirm = req.body.newPasswordConfirm;
  await user.save();

  const accessToken = signAccessToken({ id: user._id, organizationId: user.organizationId });
  res.status(200).json({ status: "success", token: accessToken, data: { user } });
});


// const { promisify } = require("util");
// const jwt = require("jsonwebtoken");
// const crypto = require("crypto");
// const UAParser = require("ua-parser-js");

// const User = require("./user.model");
// const Organization = require("../../organization/core/organization.model");
// const Role = require("./role.model");
// const Session = require("./session.model");

// const catchAsync = require("../../../core/utils/catchAsync");
// const AppError = require("../../../core/utils/appError");
// const sendEmail = require("../../../core/utils/_legacy/email");
// const { signAccessToken, signRefreshToken } = require("../../../core/utils/authUtils");
// const { createNotification } = require("../../notification/core/notification.service");
// const { emitToUser } = require("../../../core/utils/_legacy/socket");

// // ======================================================
// //  HELPERS
// // ======================================================

// const getClientIp = (req) => {
//   return (
//     req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
//     req.connection?.remoteAddress ||
//     req.socket?.remoteAddress ||
//     req.ip ||
//     "unknown"
//   );
// };

// const getDeviceInfo = (req) => {
//   try {
//     const parser = new UAParser(req.headers["user-agent"] || "");
//     const browser = parser.getBrowser()?.name || "unknown";
//     const os = parser.getOS()?.name || "unknown";
//     const dev = parser.getDevice();
//     const device = dev?.model || dev?.type || "unknown";
//     return { browser, os, device };
//   } catch {
//     return { browser: "unknown", os: "unknown", device: "unknown" };
//   }
// };

// // ======================================================
// //  CORE AUTH ACTIONS
// // ======================================================

// exports.signup = catchAsync(async (req, res, next) => {
//   const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

//   if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
//     return next(new AppError("All fields are required", 400));

//   const organization = await Organization.findOne({ uniqueShopId }).populate("owner", "name email");
//   if (!organization) return next(new AppError("Invalid Shop ID", 404));

//   const existingUser = await User.findOne({ email: email.toLowerCase(), organizationId: organization._id });
//   if (existingUser && existingUser.status !== "pending")
//     return next(new AppError("You are already registered in this organization.", 400));

//   const newUser = await User.create({
//     name,
//     email: email.toLowerCase(),
//     password,
//     passwordConfirm,
//     organizationId: organization._id,
//     status: "pending",
//   });

//   if (organization.owner?._id) {
//     const ownerId = organization.owner._id.toString();
//     emitToUser(ownerId, "newNotification", {
//       title: "New Signup Request",
//       message: `${newUser.name} has signed up.`,
//       type: "info",
//       createdAt: new Date().toISOString(),
//     });

//     const io = req.app.get("io");
//     await createNotification(
//       organization._id,
//       ownerId,
//       "USER_SIGNUP",
//       "New Employee Signup Request",
//       `${name} (${email}) is waiting for approval.`,
//       io,
//     );

//     sendEmail({
//       email: organization.owner.email,
//       subject: "New Signup Request",
//       message: `${name} (${email}) requested to join your organization.`,
//     }).catch(err => console.error("Signup Email failed:", err.message));
//   }

//   res.status(201).json({
//     status: "success",
//     message: "Signup successful. Awaiting approval.",
//   });
// });

// exports.login = catchAsync(async (req, res, next) => {
//   const { email, password, uniqueShopId } = req.body;

//   // 1. Validation
//   if (!email || !password || !uniqueShopId)
//     return next(new AppError("Email, password and Shop ID are required.", 400));

//   // 2. Organization Check
//   const organization = await Organization.findOne({ uniqueShopId });
//   if (!organization) return next(new AppError("Invalid Shop ID.", 404));

//   // 3. User Lookup
//   const user = await User.findOne({ email: email.toLowerCase(), organizationId: organization._id })
//     .select("+password")
//     .populate({ path: "role", select: "name permissions isSuperAdmin isActive" });

//   if (!user || !(await user.correctPassword(password, user.password)))
//     return next(new AppError("Invalid credentials.", 401));

//   if (user.status !== "approved")
//     return next(new AppError("Account is not approved.", 401));

//   // 4. Invalidate old sessions (Concurrency Fix)
//   await Session.updateMany({ userId: user._id, isValid: true }, { isValid: false });

//   const isOwner = organization.owner.toString() === user._id.toString();

//   // 5. Generate Tokens
//   const accessToken = signAccessToken({
//     id: user._id,
//     organizationId: user.organizationId,
//     isOwner,
//     isSuperAdmin: user.role?.isSuperAdmin || false
//   });

//   // ✅ NEW: Generate Refresh Token
//   const refreshToken = signRefreshToken({ id: user._id });

//   // 6. Create Session
//   const { browser, os, device } = getDeviceInfo(req);
//   const session = await Session.create({
//     userId: user._id,
//     token: accessToken,     // Active Access Token
//     // If your Session model has a refreshToken field, verify it here. 
//     // Otherwise, standard sessions usually just track the user login event.
//     isValid: true,
//     browser, os, deviceType: device,
//     ipAddress: getClientIp(req),
//     organizationId: user.organizationId,
//   });

//   // ✅ NEW: Send Refresh Token Cookie
//   // This logic ensures it works on Localhost (HTTP) and Render (HTTPS)
//   const isProduction = process.env.NODE_ENV === 'production';
  
//   const cookieOptions = {
//     expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 Days
//     httpOnly: true, // Prevents JS access (XSS protection)
//     secure: isProduction, // TRUE on Prod, FALSE on Localhost
//     sameSite: isProduction ? 'none' : 'lax' // 'lax' is required for localhost login
//   };

//   res.cookie('refreshToken', refreshToken, cookieOptions);

//   // 7. Send Response
//   res.status(200).json({
//     status: "success",
//     token: accessToken,
//     data: { user, session, uniqueShopId }
//   });
// });
// // exports.login = catchAsync(async (req, res, next) => {
// //   const { email, password, uniqueShopId } = req.body;

// //   if (!email || !password || !uniqueShopId)
// //     return next(new AppError("Email, password and Shop ID are required.", 400));

// //   const organization = await Organization.findOne({ uniqueShopId });
// //   if (!organization) return next(new AppError("Invalid Shop ID.", 404));

// //   const user = await User.findOne({ email: email.toLowerCase(), organizationId: organization._id })
// //     .select("+password")
// //     .populate({ path: "role", select: "name permissions isSuperAdmin isActive" });

// //   if (!user || !(await user.correctPassword(password, user.password)))
// //     return next(new AppError("Invalid credentials.", 401));

// //   if (user.status !== "approved")
// //     return next(new AppError("Account is not approved.", 401));

// //   // Invalidate all old sessions for this user before creating a new one (Concurrency Fix)
// //   await Session.updateMany({ userId: user._id, isValid: true }, { isValid: false });

// //   const isOwner = organization.owner.toString() === user._id.toString();

// //   const accessToken = signAccessToken({
// //     id: user._id,
// //     organizationId: user.organizationId,
// //     isOwner,
// //     isSuperAdmin: user.role?.isSuperAdmin || false
// //   });

// //   const { browser, os, device } = getDeviceInfo(req);
// //   const session = await Session.create({
// //     userId: user._id,
// //     token: accessToken,
// //     isValid: true,
// //     browser, os, deviceType: device,
// //     ipAddress: getClientIp(req),
// //     organizationId: user.organizationId,
// //   });

// //   res.status(200).json({
// //     status: "success",
// //     token: accessToken,
// //     data: { user, session ,uniqueShopId}
// //   });
// // });

// // ======================================================
// //  MIDDLEWARE
// // ======================================================

// exports.protect = catchAsync(async (req, res, next) => {
//   let token;
//   if (req.headers.authorization?.startsWith("Bearer")) {
//     token = req.headers.authorization.split(" ")[1];
//   } else if (req.cookies?.jwt) {
//     token = req.cookies.jwt;
//   }

//   if (!token) return next(new AppError("Not authenticated.", 401));

//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
//   } catch (err) {
//     // 🟢 CRITICAL FIX: Handle expiration explicitly for the frontend interceptor
//     if (err.name === 'TokenExpiredError') {
//       return res.status(401).json({
//         status: 'fail',
//         message: 'jwt expired',
//         code: 'TOKEN_EXPIRED'
//       });
//     }
//     return next(new AppError("Invalid token.", 401));
//   }

//   const userId = decoded.id || decoded._id || decoded.sub;
//   if (!userId) return next(new AppError("Invalid token payload.", 401));

//   // Parallel Fetch for Speed
//   const [user, session] = await Promise.all([
//     User.findById(userId).populate({ 
//       path: 'role', 
//       select: 'name permissions isSuperAdmin isActive' 
//     }),
//     Session.findOne({ userId, token, isValid: true })
//   ]);

//   if (!user) return next(new AppError("User no longer exists.", 401));
//   if (!user.isActive) return next(new AppError("User account is deactivated.", 401));
//   if (!session) return next(new AppError("Session revoked or expired. Please login again.", 401));

//   if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat)) {
//     return next(new AppError("Password was recently changed. Please login again.", 401));
//   }

//   const userObj = user.toObject();
//   req.user = {
//     ...userObj,
//     isSuperAdmin: user.role?.isSuperAdmin || user.isSuperAdmin || false,
//     permissions: user.role?.permissions || [],
//     roleName: user.role?.name || 'No Role'
//   };

//   req.session = session;

//   // Fire-and-forget last activity update
//   Session.findByIdAndUpdate(session._id, { lastActivityAt: new Date() }).exec();

//   next();
// });

// exports.restrictTo = (...permissions) => {
//   return (req, res, next) => {
//     if (!req.user) return next(new AppError("Not authorized.", 403));
//     const { isSuperAdmin, permissions: userPerms } = req.user;
//     if (permissions.includes("superadmin") && isSuperAdmin) return next();
//     const ok = permissions.some((p) => userPerms.includes(p));
//     if (!ok) return next(new AppError("Permission denied.", 403));
//     next();
//   };
// };

// exports.checkUserPermission = (permissionTag) => {
//   return async (req, res, next) => {
//     if (!req.user) return next(new AppError("User not authenticated", 401));

//     // SuperAdmin override
//     if (req.user.isSuperAdmin || req.user.permissions.includes("*")) {
//       return next();
//     }

//     const hasPermission = req.user.permissions.includes(permissionTag);
//     if (!hasPermission) {
//       return next(new AppError(`You do not have permission: ${permissionTag}`, 403));
//     }

//     next();
//   };
// };

// // ======================================================
// //  PASSWORD MANAGEMENT
// // ======================================================

// exports.forgotPassword = catchAsync(async (req, res, next) => {
//   const { email } = req.body;
//   if (!email) return next(new AppError("Email is required.", 400));

//   const user = await User.findOne({ email });
//   if (!user) return next(new AppError("No user with that email.", 404));

//   const resetToken = user.createPasswordResetToken();
//   await user.save({ validateBeforeSave: false });

//   const url = (process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`) + `/auth/reset-password/${resetToken}`;

//   try {
//     await sendEmail({
//       email: user.email,
//       subject: "Password Reset Link",
//       message: `Reset your password here: ${url}`,
//     });
//   } catch {
//     user.passwordResetToken = undefined;
//     user.passwordResetExpires = undefined;
//     await user.save({ validateBeforeSave: false });
//     return next(new AppError("Failed to send email.", 500));
//   }

//   res.status(200).json({ status: "success", message: "Password reset email sent." });
// });

// exports.resetPassword = catchAsync(async (req, res, next) => {
//   const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

//   const user = await User.findOne({
//     passwordResetToken: hashedToken,
//     passwordResetExpires: { $gt: Date.now() },
//   });

//   if (!user) return next(new AppError("Token invalid or expired.", 400));

//   user.password = req.body.password;
//   user.passwordConfirm = req.body.passwordConfirm;
//   user.passwordResetToken = undefined;
//   user.passwordResetExpires = undefined;
//   await user.save();

//   // For reset, we utilize a helper to send new token
//   const accessToken = signAccessToken({ id: user._id, organizationId: user.organizationId });
//   res.status(200).json({ status: "success", token: accessToken, data: { user } });
// });

// exports.updateMyPassword = catchAsync(async (req, res, next) => {
//   const user = await User.findById(req.user.id).select("+password");
//   if (!user) return next(new AppError("User not found.", 404));

//   if (!(await user.correctPassword(req.body.currentPassword, user.password)))
//     return next(new AppError("Incorrect current password.", 401));

//   user.password = req.body.newPassword;
//   user.passwordConfirm = req.body.newPasswordConfirm;
//   await user.save();

//   const accessToken = signAccessToken({ id: user._id, organizationId: user.organizationId });
//   res.status(200).json({ status: "success", token: accessToken, data: { user } });
// });

// // ======================================================
// //  TOKEN & SESSION VERIFICATION
// // ======================================================

// exports.verifyToken = catchAsync(async (req, res, next) => {
//   let token;
//   if (req.headers.authorization?.startsWith("Bearer")) token = req.headers.authorization.split(" ")[1];
//   else if (req.cookies?.jwt) token = req.cookies.jwt;

//   if (!token) return next(new AppError("No token provided", 401));

//   const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
//   const user = await User.findById(decoded.id).populate("role");
  
//   if (!user || !user.isActive || user.status !== "approved") return next(new AppError("User invalid", 401));

//   return res.status(200).json({
//     status: "success",
//     data: {
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         role: user.role?.name ?? null,
//         permissions: user.role?.permissions ?? [],
//       },
//     },
//   });
// });

// exports.refreshToken = catchAsync(async (req, res, next) => {
//   const refreshToken = req.cookies.refreshToken;

//   // 1. Check if token exists
//   if (!refreshToken) {
//     return next(new AppError("No refresh token provided", 401));
//   }

//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(refreshToken, process.env.REFRESH_TOKEN_SECRET);
//   } catch (err) {
//     // 🟢 FIX: If token is invalid/expired, clear it so frontend stops sending it
//     res.clearCookie("refreshToken", { httpOnly: true, sameSite: 'none', secure: true });
//     return next(new AppError("Invalid refresh token", 401));
//   }

//   // 2. Check if User still exists
//   const user = await User.findById(decoded.id).populate('role');
  
//   if (!user || !user.isActive) {
//     // 🟢 CRITICAL FIX: The user is gone. Force browser to delete the cookie.
//     // This stops the infinite retry loop.
//     res.clearCookie("refreshToken", { 
//       httpOnly: true, 
//       sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', 
//       secure: process.env.NODE_ENV === 'production' 
//     });
//     return next(new AppError("User no longer exists", 401));
//   }

//   // 3. Check Session
//   const sessionExists = await Session.findOne({ userId: user._id, isValid: true });
//   if (!sessionExists) {
//     res.clearCookie("refreshToken", { 
//       httpOnly: true, 
//       sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', 
//       secure: process.env.NODE_ENV === 'production' 
//     });
//     return next(new AppError("Session expired. Please login again.", 401));
//   }

//   // 4. Issue new Access Token
//   const userForToken = {
//     id: user._id,
//     organizationId: user.organizationId,
//     role: user.role?._id,
//     isSuperAdmin: user.role?.isSuperAdmin || false
//   };

//   const newAccessToken = signAccessToken(userForToken);
  
//   // Update session with new access token
//   sessionExists.token = newAccessToken;
//   await sessionExists.save();

//   res.status(200).json({ status: "success", token: newAccessToken });
// });

// exports.logout = catchAsync(async (req, res, next) => {
//   if (req.user?.id) {
//     await Session.updateMany({ userId: req.user.id, isValid: true }, { isValid: false });
//   }
//   res.cookie("refreshToken", "", { httpOnly: true, expires: new Date(0) });
//   res.status(200).json({ status: "success", message: "Logged out successfully." });
// });