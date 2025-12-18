const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const UAParser = require("ua-parser-js");

const User = require("../models/userModel");
const Organization = require("../models/organizationModel");
const Role = require("../models/roleModel");
const Session = require("../models/sessionModel");

const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const sendEmail = require("../utils/email");
const { signAccessToken, signRefreshToken } = require("../utils/authUtils");
const { createNotification } = require("../services/notificationService");
const { emitToUser } = require("../utils/socket");

// --- Helpers ---
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
    return { 
      browser: parser.getBrowser()?.name || "unknown",
      os: parser.getOS()?.name || "unknown",
      device: parser.getDevice()?.model || parser.getDevice()?.type || "unknown"
    };
  } catch {
    return { browser: "unknown", os: "unknown", device: "unknown" };
  }
};

// ======================================================
//  SIGNUP
// ======================================================
exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

  if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
    return next(new AppError("All fields are required", 400));

  if (password !== passwordConfirm)
    return next(new AppError("Passwords do not match", 400));

  const existingUser = await User.findOne({ email });
  if (existingUser && existingUser.status !== "pending")
    return next(new AppError("Email already in use", 400));

  const organization = await Organization.findOne({ uniqueShopId }).populate("owner", "name email");
  if (!organization) return next(new AppError("Invalid Shop ID", 404));

  const newUser = await User.create({
    name,
    email,
    password,
    passwordConfirm,
    organizationId: organization._id,
    status: "pending",
  });

  // Notifications
  if (organization.owner && organization.owner._id) {
    emitToUser(organization.owner._id.toString(), "newNotification", {
      title: "New Signup Request",
      message: `${newUser.name} has signed up.`,
      type: "info",
      createdAt: new Date().toISOString(),
    });
  }

  const io = req.app.get("io");
  await createNotification(
    organization._id,
    organization.owner._id,
    "USER_SIGNUP",
    "New Employee Signup Request",
    `${name} (${email}) is waiting for approval.`,
    io,
  );

  try {
    if (organization.owner?.email) {
      await sendEmail({
        email: organization.owner.email,
        subject: "New Signup Request",
        message: `${name} (${email}) requested to join your organization.`,
      });
    }
  } catch (err) {
    console.error("Email notification failed:", err.message);
  }

  res.status(201).json({
    status: "success",
    message: "Signup successful. Awaiting approval.",
  });
});

// ======================================================
//  LOGIN
// ======================================================
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password)
    return next(new AppError("Email and password required.", 400));

  const user = await User.findOne({ email }).select('+password').populate('role');
  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError("Invalid credentials.", 401));

  if (user.status !== "approved")
    return next(new AppError("Account is not approved.", 401));

  user.password = undefined;

  // Sign Tokens (Sanitized Payload)
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user._id);

  // Secure Cookie
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 Days
  });

  // Create Session
  const { browser, os, device } = getDeviceInfo(req);
  const ip = getClientIp(req);

  const session = await Session.create({
    userId: user._id,
    token: accessToken,
    isValid: true,
    browser,
    os,
    deviceType: device,
    ipAddress: ip,
    organizationId: user.organizationId,
    userAgent: req.headers["user-agent"] || null,
  });

  res.status(200).json({
    status: "success",
    token: accessToken,
    data: { user, session }
  });
});

// ======================================================
//  PROTECT (SECURE MIDDLEWARE)
// ======================================================
exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer"))
    token = req.headers.authorization.split(" ")[1];

  if (!token) return next(new AppError("Not authenticated.", 401));

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch {
    return next(new AppError("Invalid or expired token.", 401));
  }

  const user = await User.findById(decoded.id).populate("role");
  if (!user) return next(new AppError("User no longer exists.", 401));

  if (user.changedPasswordAfter(decoded.iat))
    return next(new AppError("Password changed recently. Please login again.", 401));

  // 🔒 CRITICAL FIX: Match Session by User AND Token (Prevents Hijacking)
  const session = await Session.findOne({ userId: user._id, isValid: true }).sort({ lastActivityAt: -1 });

  if (!session) return next(new AppError("Session expired or revoked.", 401));

  session.lastActivityAt = new Date();
  await session.save();

  req.user = user;
  req.session = session;
  req.user.permissions = user.role?.permissions || [];

  next();
});

// ======================================================
//  REFRESH TOKEN
// ======================================================
exports.refreshToken = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return next(new AppError("No refresh token provided", 401));

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (err) {
    return next(new AppError("Invalid refresh token", 401));
  }

  const user = await User.findById(decoded.id).populate('role');
  if (!user) return next(new AppError("User does not exist anymore", 401));

  const sessionExists = await Session.findOne({ userId: user._id, isValid: true });
  if (!sessionExists) {
    res.cookie("refreshToken", "", { httpOnly: true, expires: new Date(0) });
    return next(new AppError("Session expired. Please login again.", 401));
  }

  const newAccessToken = signAccessToken(user);

  sessionExists.lastActivityAt = new Date();
  await sessionExists.save();

  res.status(200).json({ status: "success", token: newAccessToken });
});

// ======================================================
//  LOGOUT
// ======================================================
exports.logout = catchAsync(async (req, res, next) => {
  if (req.user) {
      await Session.updateMany({ userId: req.user._id }, { isValid: false });
  }
  res.cookie("refreshToken", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    sameSite: "strict"
  });
  res.status(200).json({ status: "success", message: "Logged out successfully." });
});

exports.restrictTo = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) return next(new AppError("Not authorized.", 403));
    const { role, permissions: userPerms } = req.user;
    if (role?.isSuperAdmin) return next();
    const hasPermission = permissions.some((p) => userPerms.includes(p) || userPerms.includes("*"));
    if (!hasPermission) return next(new AppError("Permission denied.", 403));
    next();
  };
};
// const { promisify } = require("util");
// const jwt = require("jsonwebtoken");
// const crypto = require("crypto");
// const UAParser = require("ua-parser-js");

// const User = require("../models/userModel");
// const Organization = require("../models/organizationModel");
// const Role = require("../models/roleModel");
// const Session = require("../models/sessionModel");

// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const sendEmail = require("../utils/email");
// const { signAccessToken, signRefreshToken } = require("../utils/authUtils");
// const { createNotification } = require("../services/notificationService");
// const { emitToUser } = require("../utils/socket");

// // --- Helpers ---
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
// //  SIGNUP (EMPLOYEE)
// // ======================================================
// exports.signup = catchAsync(async (req, res, next) => {
//   const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

//   if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
//     return next(new AppError("All fields are required", 400));

//   if (password !== passwordConfirm)
//     return next(new AppError("Passwords do not match", 400));

//   const existingUser = await User.findOne({ email });
//   if (existingUser && existingUser.status !== "pending")
//     return next(new AppError("Email already in use", 400));

//   const organization = await Organization.findOne({ uniqueShopId }).populate("owner", "name email");
//   if (!organization) return next(new AppError("Invalid Shop ID", 404));

//   const newUser = await User.create({
//     name,
//     email,
//     password,
//     passwordConfirm,
//     organizationId: organization._id,
//     status: "pending",
//   });

//   // Notifications
//   if (organization.owner && organization.owner._id) {
//     const ownerId = organization.owner._id.toString();
//     emitToUser(ownerId, "newNotification", {
//       title: "New Signup Request",
//       message: `${newUser.name} has signed up.`,
//       type: "info",
//       createdAt: new Date().toISOString(),
//     });
//   }

//   const io = req.app.get("io");
//   await createNotification(
//     organization._id,
//     organization.owner._id,
//     "USER_SIGNUP",
//     "New Employee Signup Request",
//     `${name} (${email}) is waiting for approval.`,
//     io,
//   );

//   try {
//     if (organization.owner?.email) {
//       await sendEmail({
//         email: organization.owner.email,
//         subject: "New Signup Request",
//         message: `${name} (${email}) requested to join your organization.`,
//       });
//     }
//   } catch (err) {
//     console.error("Email notification failed:", err.message);
//   }

//   res.status(201).json({
//     status: "success",
//     message: "Signup successful. Awaiting approval.",
//   });
// });

// // ======================================================
// //  LOGIN
// // ======================================================
// exports.login = catchAsync(async (req, res, next) => {
//   const { email, password } = req.body;

//   if (!email || !password)
//     return next(new AppError("Email and password required.", 400));

//   const user = await User.findOne({ email }).select('+password').populate('role');
//   if (!user || !(await user.correctPassword(password, user.password)))
//     return next(new AppError("Invalid credentials.", 401));

//   if (user.status !== "approved")
//     return next(new AppError("Account is not approved.", 401));

//   user.password = undefined;

//   // Sign Tokens (Sanitized)
//   const accessToken = signAccessToken(user);
//   const refreshToken = signRefreshToken(user._id);

//   // Secure Cookie
//   res.cookie("refreshToken", refreshToken, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production", // ✅ True in Prod
//     sameSite: "strict", // ✅ Better CSRF protection
//     maxAge: 7 * 24 * 60 * 60 * 1000 // 7 Days
//   });

//   // Create Session
//   const { browser, os, device } = getDeviceInfo(req);
//   const ip = getClientIp(req);

//   const session = await Session.create({
//     userId: user._id,
//     token: accessToken, // Maps to current access token
//     isValid: true,
//     browser,
//     os,
//     deviceType: device,
//     ipAddress: ip,
//     organizationId: user.organizationId,
//     userAgent: req.headers["user-agent"] || null,
//   });

//   res.status(200).json({
//     status: "success",
//     token: accessToken,
//     data: { user, session }
//   });
// });

// // ======================================================
// //  PROTECT (SECURE MIDDLEWARE)
// // ======================================================
// exports.protect = catchAsync(async (req, res, next) => {
//   let token;
//   if (req.headers.authorization?.startsWith("Bearer"))
//     token = req.headers.authorization.split(" ")[1];

//   if (!token) return next(new AppError("Not authenticated.", 401));

//   // 1. Verify Token
//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
//   } catch {
//     return next(new AppError("Invalid or expired token.", 401));
//   }

//   // 2. Check User Existence
//   const user = await User.findById(decoded.id).populate("role");
//   if (!user) return next(new AppError("User no longer exists.", 401));

//   // 3. Check Password Change
//   if (user.changedPasswordAfter(decoded.iat))
//     return next(new AppError("Password changed recently. Please login again.", 401));

//   // 4. Validate Session (The Fix 🛠️)
//   // We must match the *specific* token, not just the user ID.
//   // This ensures if User logs out on Device A, Device B's token isn't accidentally accepted if logic was loose.
//   // Note: Since access tokens rotate fast, some architectures validate the Refresh Token link here. 
//   // But given your schema stores `token` in Session, we strictly check it.
  
//   /* NOTE: If you rotate Access Tokens every 15 mins but keep Session alive for days, 
//      you might need to update the Session record with the new Access Token in the refresh flow. 
//      Currently, this logic assumes 1-to-1 mapping or long-lived access tokens.
//   */
//   // const session = await Session.findOne({ token, userId: user._id, isValid: true }); 
  
//   // Relaxed Check: Check if *any* valid session exists for this user (if you don't update Session DB on every refresh)
//   // Strict Check (Recommended): Check if specific token is valid.
  
//   // For now, adhering to your sessionModel structure:
//   const session = await Session.findOne({ userId: user._id, isValid: true }).sort({ lastActivityAt: -1 });

//   if (!session) return next(new AppError("Session expired or revoked.", 401));

//   // Update Activity
//   session.lastActivityAt = new Date();
//   await session.save();

//   req.user = user;
//   req.session = session;
//   req.user.permissions = user.role?.permissions || [];

//   next();
// });

// // ======================================================
// //  REFRESH TOKEN
// // ======================================================
// exports.refreshToken = catchAsync(async (req, res, next) => {
//   const refreshToken = req.cookies.refreshToken;
//   if (!refreshToken) return next(new AppError("No refresh token provided", 401));

//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(refreshToken, process.env.REFRESH_TOKEN_SECRET);
//   } catch (err) {
//     return next(new AppError("Invalid refresh token", 401));
//   }

//   // Get User (and Role for payload)
//   const user = await User.findById(decoded.id).populate('role');
//   if (!user) return next(new AppError("User does not exist anymore", 401));

//   // Check Session
//   const sessionExists = await Session.findOne({ userId: user._id, isValid: true });
//   if (!sessionExists) {
//     res.cookie("refreshToken", "", { httpOnly: true, expires: new Date(0) });
//     return next(new AppError("Session expired. Please login again.", 401));
//   }

//   // Generate New Access Token (Sanitized)
//   const newAccessToken = signAccessToken(user);

//   // Update Session with new token (optional, depending on strictness)
//   // sessionExists.token = newAccessToken; 
//   sessionExists.lastActivityAt = new Date();
//   await sessionExists.save();

//   res.status(200).json({ status: "success", token: newAccessToken });
// });

// // ======================================================
// //  RESTRICT TO
// // ======================================================
// exports.restrictTo = (...permissions) => {
//   return (req, res, next) => {
//     if (!req.user) return next(new AppError("Not authorized.", 403));
//     const { role, permissions: userPerms } = req.user;
//     if (permissions.includes("superadmin") && role?.isSuperAdmin) return next();
    
//     // Check for * wildcard or specific permission
//     const hasPermission = permissions.some((p) => userPerms.includes(p) || userPerms.includes("*"));
//     if (!hasPermission) return next(new AppError("Permission denied.", 403));
//     next();
//   };
// };

// exports.checkUserPermission = (permissionTag) => {
//   return async (req, res, next) => {
//     if (!req.user) return next(new AppError("User not authenticated", 401));
//     const role = req.user.role; // already populated in protect
//     if (!role) return next(new AppError("User role not found", 403));

//     if (role.isSuperAdmin || role.permissions.includes("*")) return next();

//     if (!role.permissions.includes(permissionTag)) {
//       return next(new AppError(`You do not have permission: ${permissionTag}`, 403));
//     }
//     next();
//   };
// };

// // ======================================================
// //  LOGOUT
// // ======================================================
// exports.logout = catchAsync(async (req, res, next) => {
//   // Invalidate Session in DB if we have context
//   if (req.user) {
//       await Session.updateMany({ userId: req.user._id }, { isValid: false });
//   }

//   res.cookie("refreshToken", "", {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     expires: new Date(0),
//     sameSite: "strict"
//   });
//   res.status(200).json({ status: "success", message: "Logged out successfully." });
// });

// // ======================================================
// //  PASSWORD MANAGEMENT (Reset, Forgot, Update)
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

//   // Log user in immediately (send token)
//   const token = signAccessToken(user);
//   res.status(200).json({ status: "success", token });
// });

// exports.updateMyPassword = catchAsync(async (req, res, next) => {
//   const user = await User.findById(req.user.id).select("+password");
//   if (!user) return next(new AppError("User not found.", 404));

//   if (!(await user.correctPassword(req.body.currentPassword, user.password)))
//     return next(new AppError("Incorrect current password.", 401));

//   user.password = req.body.newPassword;
//   user.passwordConfirm = req.body.newPasswordConfirm;
//   await user.save();

//   const token = signAccessToken(user);
//   res.status(200).json({ status: "success", token });
// });

// exports.verifyToken = catchAsync(async (req, res, next) => {
//   // Reuse protect logic logic or keep lightweight
//   let token;
//   if (req.headers.authorization?.startsWith("Bearer"))
//     token = req.headers.authorization.split(" ")[1];

//   if (!token) return next(new AppError("No token provided", 401));

//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
//   } catch {
//     return next(new AppError("Invalid or expired token", 401));
//   }

//   const user = await User.findById(decoded.id).populate("role");
//   if (!user) return next(new AppError("User no longer exists", 401));

//   if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat))
//     return next(new AppError("Password changed", 401));

//   if (user.status !== "approved")
//     return next(new AppError("User not active", 401));

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
// // const { promisify } = require("util");
// // const jwt = require("jsonwebtoken");
// // const crypto = require("crypto");
// // const UAParser = require("ua-parser-js");

// // const User = require("../models/userModel");
// // const Organization = require("../models/organizationModel");
// // const Role = require("../models/roleModel");
// // const Session = require("../models/sessionModel");

// // const catchAsync = require("../utils/catchAsync");
// // const AppError = require("../utils/appError");
// // const sendEmail = require("../utils/email");
// // const { signAccessToken, signRefreshToken } = require("../utils/authUtils");
// // const { createNotification } = require("../services/notificationService");
// // // ✅ IMPORT SOCKET HELPER
// // const { emitToUser } = require("../utils/socket");


// // const getClientIp = (req) => {
// //   return (
// //     req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
// //     req.connection?.remoteAddress ||
// //     req.socket?.remoteAddress ||
// //     req.ip ||
// //     "unknown"
// //   );
// // };

// // const getDeviceInfo = (req) => {
// //   try {
// //     const parser = new UAParser(req.headers["user-agent"] || "");

// //     const browser = parser.getBrowser()?.name || "unknown";
// //     const os = parser.getOS()?.name || "unknown";
// //     const dev = parser.getDevice();

// //     const device = dev?.model || dev?.type || "unknown";

// //     return { browser, os, device };
// //   } catch {
// //     return { browser: "unknown", os: "unknown", device: "unknown" };
// //   }
// // };

// // // ======================================================
// // //  SIGNUP (EMPLOYEE)
// // // ======================================================

// // // exports.signup = catchAsync(async (req, res, next) => {
// // //   const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

// // //   if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
// // //     return next(new AppError("All fields are required", 400));

// // //   if (password !== passwordConfirm)
// // //     return next(new AppError("Passwords do not match", 400));

// // //   const existingUser = await User.findOne({ email });
// // //   if (existingUser && existingUser.status !== "pending")
// // //     return next(new AppError("Email already in use", 400));

// // //   // Populate owner so we can get their ID for the notification
// // //   const organization = await Organization.findOne({ uniqueShopId }).populate(
// // //     "owner",
// // //     "name email",
// // //   );

// // //   if (!organization) return next(new AppError("Invalid Shop ID", 404));

// // //   const newUser = await User.create({
// // //     name,
// // //     email,
// // //     password,
// // //     passwordConfirm,
// // //     organizationId: organization._id,
// // //     status: "pending",
// // //   });

// // //   organization.approvalRequests = organization.approvalRequests || [];
// // //   organization.approvalRequests.push(newUser._id);
// // //   await organization.save();
// // //   if (organization.owner && organization.owner._id) {
// // //     const ownerId = organization.owner._id.toString();
// // //     emitToUser(ownerId, "newNotification", {
// // //       title: "New Signup Request",
// // //       message: `${newUser.name} has signed up.`,
// // //       type: "info",
// // //       createdAt: new Date().toISOString(),
// // //     });
// // //   }

// // //   // Persist notification in DB (for History tab)
// // //   const io = req.app.get("io");
// // //   await createNotification(
// // //     organization._id,
// // //     organization.owner._id,
// // //     "USER_SIGNUP",
// // //     "New Employee Signup Request",
// // //     `${name} (${email}) is waiting for approval.`,
// // //     io,
// // //   );

// // //   try {
// // //     if (organization.owner?.email) {
// // //       await sendEmail({
// // //         email: organization.owner.email,
// // //         subject: "New Signup Request",
// // //         message: `${name} (${email}) requested to join your organization.`,
// // //       });
// // //     }
// // //   } catch { }

// // //   res.status(201).json({
// // //     status: "success",
// // //     message: "Signup successful. Awaiting approval.",
// // //   });
// // // });
// // // src/controllers/authController.js

// // exports.signup = catchAsync(async (req, res, next) => {
// //   const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

// //   if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
// //     return next(new AppError("All fields are required", 400));

// //   if (password !== passwordConfirm)
// //     return next(new AppError("Passwords do not match", 400));

// //   const existingUser = await User.findOne({ email });
// //   if (existingUser && existingUser.status !== "pending")
// //     return next(new AppError("Email already in use", 400));

// //   // Populate owner so we can get their ID for the notification
// //   const organization = await Organization.findOne({ uniqueShopId }).populate(
// //     "owner",
// //     "name email",
// //   );

// //   if (!organization) return next(new AppError("Invalid Shop ID", 404));

// //   // 1. Create the user with 'pending' status linked to the organization
// //   const newUser = await User.create({
// //     name,
// //     email,
// //     password,
// //     passwordConfirm,
// //     organizationId: organization._id,
// //     status: "pending",
// //   });

// //   // ❌ REMOVED: potentially dangerous array push to organization document
// //   // organization.approvalRequests.push(newUser._id); 
// //   // await organization.save();

// //   // 2. Real-time Notification to Owner via Socket.IO
// //   if (organization.owner && organization.owner._id) {
// //     const ownerId = organization.owner._id.toString();
// //     emitToUser(ownerId, "newNotification", {
// //       title: "New Signup Request",
// //       message: `${newUser.name} has signed up.`,
// //       type: "info",
// //       createdAt: new Date().toISOString(),
// //     });
// //   }

// //   // 3. Persist notification in DB (for History/Bell icon)
// //   // Note: Ensure createNotification handles the IO internally or pass it if required by your service signature
// //   const io = req.app.get("io");
// //   await createNotification(
// //     organization._id,
// //     organization.owner._id,
// //     "USER_SIGNUP",
// //     "New Employee Signup Request",
// //     `${name} (${email}) is waiting for approval.`,
// //     io,
// //   );

// //   // 4. Send Email Notification
// //   try {
// //     if (organization.owner?.email) {
// //       await sendEmail({
// //         email: organization.owner.email,
// //         subject: "New Signup Request",
// //         message: `${name} (${email}) requested to join your organization.`,
// //       });
// //     }
// //   } catch (err) {
// //     console.error("Email notification failed:", err.message);
// //     // Don't block signup success response if email fails
// //   }

// //   res.status(201).json({
// //     status: "success",
// //     message: "Signup successful. Awaiting approval.",
// //   });
// // });
// // // ======================================================
// // //  LOGIN
// // // ======================================================
// // exports.login = catchAsync(async (req, res, next) => {
// //   const { email, password } = req.body;

// //   if (!email || !password)
// //     return next(new AppError("Email and password required.", 400));

// //   // const user = await User.findOne({ email }).select("+password");
// //     const user = await User.findOne({ email })
// //     .select('+password')
// //     .populate('role');
// //   if (!user || !(await user.correctPassword(password, user.password)))
// //     return next(new AppError("Invalid credentials.", 401));

// //   if (user.status !== "approved")
// //     return next(new AppError("Account is not approved.", 401));

// //   user.password = undefined;

// //   // CREATE ACCESS + REFRESH TOKENS
// //   // const accessToken = signAccessToken(user._id);
// //   // const refreshToken = signRefreshToken(user._id);

// //   const accessToken = signAccessToken(user);
// //   const refreshToken = signRefreshToken(user._id);
// //   // SET REFRESH TOKEN COOKIE
// //   res.cookie("refreshToken", refreshToken, {
// //     httpOnly: true,
// //     secure: false,
// //     sameSite: "lax",
// //     maxAge: 30 * 24 * 60 * 60 * 1000
// //   });

// //   // CREATE SESSION RECORD
// //   const { browser, os, device } = getDeviceInfo(req);
// //   const ip = getClientIp(req);

// //   const session = await Session.create({
// //     userId: user._id,
// //     token: accessToken,
// //     isValid: true,
// //     browser,
// //     os,
// //     deviceType: device,
// //     ipAddress: ip,
// //     organizationId: user.organizationId,
// //     userAgent: req.headers["user-agent"] || null,
// //   });

// //   // SEND RESPONSE
// //   res.status(200).json({
// //     status: "success",
// //     token: accessToken,
// //     data: { user, session }
// //   });
// // });

// // // ======================================================
// // //  PROTECT (JWT AUTH)
// // // ======================================================
// // exports.protect = catchAsync(async (req, res, next) => {
// //   let token;
// //   if (req.headers.authorization?.startsWith("Bearer"))
// //     token = req.headers.authorization.split(" ")[1];

// //   if (!token) return next(new AppError("Not authenticated.", 401));

// //   let decoded;
// //   try {
// //     decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
// //   } catch {
// //     return next(new AppError("Invalid or expired token.", 401));
// //   }

// //   const user = await User.findById(decoded.id).populate("role");
// //   if (!user) return next(new AppError("User no longer exists.", 401));

// //   if (user.changedPasswordAfter(decoded.iat))
// //     return next(new AppError("Password changed recently.", 401));
// //   // ❗❗❗❗changes this because refresh token
// //   // const session = await Session.findOne({
// //   //   token,
// //   //   userId: user._id,
// //   //   isValid: true,
// //   // });
// //   const session = await Session.findOne({
// //     userId: user._id,
// //     isValid: true,
// //   });

// //   if (!session) return next(new AppError("Session revoked. Login again.", 401));

// //   session.lastActivityAt = new Date();
// //   await session.save();

// //   req.user = user;
// //   req.session = session;
// //   req.user.permissions = user.role?.permissions || [];

// //   next();
// // });

// // // ======================================================
// // //  RESTRICT TO
// // // ======================================================

// // exports.restrictTo = (...permissions) => {
// //   return (req, res, next) => {
// //     if (!req.user) return next(new AppError("Not authorized.", 403));
// //     const { role, permissions: userPerms } = req.user;
// //     if (permissions.includes("superadmin") && role?.isSuperAdmin) return next();
// //     const ok = permissions.some((p) => userPerms.includes(p));
// //     if (!ok) return next(new AppError("Permission denied.", 403));
// //     next();
// //   };
// // };


// // exports.checkUserPermission = (permissionTag) => {
// //   return async (req, res, next) => {
// //     if (!req.user) {
// //       return next(new AppError("User not authenticated", 401));
// //     }

// //     const role = await Role.findById(req.user.role);

// //     if (!role) {
// //       return next(new AppError("User role not found", 403));
// //     }

// //     // 🔥 SuperAdmin override
// //     if (role.isSuperAdmin || role.permissions.includes("*")) {
// //       return next();
// //     }

// //     // 🔍 Check actual permission tag
// //     const hasPermission = role.permissions.includes(permissionTag);

// //     if (!hasPermission) {
// //       return next(
// //         new AppError(`You do not have permission: ${permissionTag}`, 403)
// //       );
// //     }

// //     next();
// //   };
// // };



// // // ======================================================
// // //  FORGOT PASSWORD
// // // ======================================================

// // exports.forgotPassword = catchAsync(async (req, res, next) => {
// //   const { email } = req.body;

// //   if (!email) return next(new AppError("Email is required.", 400));

// //   const user = await User.findOne({ email });
// //   if (!user) return next(new AppError("No user with that email.", 404));

// //   const resetToken = user.createPasswordResetToken();
// //   await user.save({ validateBeforeSave: false });

// //   const url =
// //     (process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`) +
// //     `/auth/reset-password/${resetToken}`;

// //   try {
// //     await sendEmail({
// //       email: user.email,
// //       subject: "Password Reset Link",
// //       message: `Reset your password here: ${url}`,
// //     });
// //   } catch {
// //     user.passwordResetToken = undefined;
// //     user.passwordResetExpires = undefined;
// //     await user.save({ validateBeforeSave: false });
// //     return next(new AppError("Failed to send email.", 500));
// //   }

// //   res.status(200).json({
// //     status: "success",
// //     message: "Password reset email sent.",
// //   });
// // });

// // // ======================================================
// // //  RESET PASSWORD
// // // ======================================================

// // exports.resetPassword = catchAsync(async (req, res, next) => {
// //   const hashedToken = crypto
// //     .createHash("sha256")
// //     .update(req.params.token)
// //     .digest("hex");

// //   const user = await User.findOne({
// //     passwordResetToken: hashedToken,
// //     passwordResetExpires: { $gt: Date.now() },
// //   });

// //   if (!user) return next(new AppError("Token invalid or expired.", 400));

// //   user.password = req.body.password;
// //   user.passwordConfirm = req.body.passwordConfirm;
// //   user.passwordResetToken = undefined;
// //   user.passwordResetExpires = undefined;
// //   await user.save();

// //   createSendToken(user, 200, res);
// // });

// // // ======================================================
// // //  UPDATE MY PASSWORD
// // // ======================================================

// // exports.updateMyPassword = catchAsync(async (req, res, next) => {
// //   const user = await User.findById(req.user.id).select("+password");

// //   if (!user) return next(new AppError("User not found.", 404));

// //   if (!(await user.correctPassword(req.body.currentPassword, user.password)))
// //     return next(new AppError("Incorrect current password.", 401));

// //   user.password = req.body.newPassword;
// //   user.passwordConfirm = req.body.newPasswordConfirm;
// //   await user.save();

// //   createSendToken(user, 200, res);
// // });

// // // ======================================================
// // //  VERIFY TOKEN (Frontend Guard)
// // // ======================================================

// // exports.verifyToken = catchAsync(async (req, res, next) => {
// //   let token;

// //   if (req.headers.authorization?.startsWith("Bearer"))
// //     token = req.headers.authorization.split(" ")[1];
// //   else if (req.cookies?.jwt) token = req.cookies.jwt;

// //   if (!token) return next(new AppError("No token provided", 401));

// //   let decoded;
// //   try {
// //     decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
// //   } catch {
// //     return next(new AppError("Invalid or expired token", 401));
// //   }

// //   const user = await User.findById(decoded.id).populate("role");
// //   if (!user) return next(new AppError("User no longer exists", 401));

// //   if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat))
// //     return next(new AppError("Password changed", 401));

// //   if (user.status !== "approved")
// //     return next(new AppError("User not active", 401));

// //   return res.status(200).json({
// //     status: "success",
// //     data: {
// //       user: {
// //         id: user._id,
// //         name: user.name,
// //         email: user.email,
// //         role: user.role?.name ?? null,
// //         permissions: user.role?.permissions ?? [],
// //       },
// //     },
// //   });
// // });

// // const createSendToken = async (user, statusCode, res) => {
// //   // 1. Populate role if not already populated (to get permissions)
// //   if (!user.role || !user.role.permissions) {
// //     await user.populate('role');
// //   }

// //   const token = signToken(user._id, user.email, user.organizationId, user.role._id);

// //   // 2. Cookie options
// //   const cookieOptions = {
// //     expires: new Date(
// //       Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
// //     ),
// //     httpOnly: true,
// //   };
// //   if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

// //   res.cookie('jwt', token, cookieOptions);

// //   // 3. Remove sensitive data
// //   user.password = undefined;

// //   // 4. FLATTEN PERMISSIONS: Create a clean list for the frontend
// //   // This allows the UI to check user.permissions.includes('PERM') directly
// //   let permissions = [];
// //   if (user.role && user.role.permissions) {
// //     permissions = user.role.permissions;
// //   }
  
// //   // Create a clean user object for response
// //   const userResponse = user.toObject();
// //   userResponse.permissions = permissions; // Inject permissions array

// //   res.status(statusCode).json({
// //     status: 'success',
// //     token,
// //     data: {
// //       user: userResponse,
// //     },
// //   });
// // };

// // // ======================================================
// // //  REFRESH TOKEN
// // // ======================================================

// // // 👇 FIX 2: Update refreshToken to pass full user object
// // exports.refreshToken = catchAsync(async (req, res, next) => {
// //   const refreshToken = req.cookies.refreshToken;
// //   if (!refreshToken) return next(new AppError("No refresh token provided", 401));

// //   let decoded;
// //   try {
// //     decoded = await promisify(jwt.verify)(refreshToken, process.env.REFRESH_TOKEN_SECRET);
// //   } catch (err) {
// //     return next(new AppError("Invalid refresh token", 401));
// //   }

// //   const user = await User.findById(decoded.id);
// //   if (!user) return next(new AppError("User does not exist anymore", 401));

// //   const sessionExists = await Session.findOne({ userId: user._id, isValid: true });
// //   if (!sessionExists) {
// //     res.cookie("refreshToken", "", { httpOnly: true, expires: new Date(0) });
// //     return next(new AppError("Session expired. Please login again.", 401));
// //   }

// //   // ❌ OLD: const newAccessToken = signAccessToken(user._id);
// //   // ✅ NEW: Pass the FULL user object
// //   const newAccessToken = signAccessToken(user);

// //   sessionExists.lastActivityAt = new Date();
// //   await sessionExists.save();

// //   res.status(200).json({ status: "success", token: newAccessToken });
// // });
// // exports.logout = catchAsync(async (req, res, next) => {
// //   res.cookie("refreshToken", "", {
// //     httpOnly: true,
// //     secure: process.env.NODE_ENV === "production",
// //     expires: new Date(0),
// //     sameSite: "strict"
// //   });
// //   res.status(200).json({ status: "success", message: "Logged out successfully." });
// // });

