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
// ✅ IMPORT SOCKET HELPER
const { emitToUser } = require("../utils/socket");

// ======================================================
//  HELPERS
// ======================================================

// const createSendToken = (user, statusCode, res) => {
//   const accessToken = signAccessToken(user._id);
//   const refreshToken = signRefreshToken(user._id);

//   res.cookie("refreshToken", refreshToken, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "strict",
//     maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
//   });

//   const safeUser = {
//     id: user._id,
//     name: user.name,
//     email: user.email,
//     role: user.role || null,
//     status: user.status || null,
//   };

//   res.status(statusCode).json({
//     status: "success",
//     token: accessToken,
//     data: { user: safeUser },
//   });
// };

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


// ======================================================
//  SIGNUP (EMPLOYEE)
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

  // Populate owner so we can get their ID for the notification
  const organization = await Organization.findOne({ uniqueShopId }).populate(
    "owner",
    "name email",
  );

  if (!organization) return next(new AppError("Invalid Shop ID", 404));

  const newUser = await User.create({
    name,
    email,
    password,
    passwordConfirm,
    organizationId: organization._id,
    status: "pending",
  });

  // ✅ REVERTED: Pushing ONLY the User ID string as requested
  organization.approvalRequests = organization.approvalRequests || [];
  organization.approvalRequests.push(newUser._id);

  await organization.save();

  // ✅ REAL-TIME NOTIFICATION TO OWNER
  if (organization.owner && organization.owner._id) {
    const ownerId = organization.owner._id.toString();

    emitToUser(ownerId, "newNotification", {
      title: "New Signup Request",
      message: `${newUser.name} has signed up.`,
      type: "info",
      createdAt: new Date().toISOString(),
    });
  }

  // Persist notification in DB (for History tab)
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
  } catch { }

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

  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError("Invalid credentials.", 401));

  if (user.status !== "approved")
    return next(new AppError("Account is not approved.", 401));

  user.password = undefined;

  // CREATE ACCESS + REFRESH TOKENS
  // const accessToken = signAccessToken(user._id);
  // const refreshToken = signRefreshToken(user._id);

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user._id);
  // SET REFRESH TOKEN COOKIE
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  // CREATE SESSION RECORD
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

  // SEND RESPONSE
  res.status(200).json({
    status: "success",
    token: accessToken,
    data: { user, session }
  });
});

// exports.login = catchAsync(async (req, res, next) => {
//   const { email, password } = req.body;

//   if (!email || !password)
//     return next(new AppError("Email and password required.", 400));

//   const user = await User.findOne({ email }).select("+password");
//   if (!user || !(await user.correctPassword(password, user.password)))
//     return next(new AppError("Invalid credentials.", 401));

//   if (user.status !== "approved")
//     return next(new AppError("Account is not approved.", 401));

//   const token = signAccessToken(user._id);

//   const { browser, os, device } = getDeviceInfo(req);
//   const ip = getClientIp(req);

//   const session = await Session.create({
//     userId: user._id,
//     token,
//     isValid: true,
//     browser,
//     os,
//     deviceType: device,
//     ipAddress: ip,
//     organizationId: user.organizationId,
//     userAgent: req.headers["user-agent"] || null,
//   });

//   const io = req.app.get("io");
//   if (io) {
//     io.to(user._id.toString()).emit("sessionCreated", {
//       sessionId: session._id,
//       token,
//       browser,
//       os,
//       device,
//       ip,
//       loginAt: session.createdAt,
//     });
//   }

//   user.password = undefined;

//   res.status(200).json({
//     status: "success",
//     token,
//     data: { user, session },
//   });
// });

// ======================================================
//  PROTECT (JWT AUTH)
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
    return next(new AppError("Password changed recently.", 401));
  // ❗❗❗❗changes this because refresh token
  // const session = await Session.findOne({
  //   token,
  //   userId: user._id,
  //   isValid: true,
  // });
  const session = await Session.findOne({
    userId: user._id,
    isValid: true,
  });

  if (!session) return next(new AppError("Session revoked. Login again.", 401));

  session.lastActivityAt = new Date();
  await session.save();

  req.user = user;
  req.session = session;
  req.user.permissions = user.role?.permissions || [];

  next();
});

// ======================================================
//  RESTRICT TO
// ======================================================

exports.restrictTo = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) return next(new AppError("Not authorized.", 403));
    const { role, permissions: userPerms } = req.user;
    if (permissions.includes("superadmin") && role?.isSuperAdmin) return next();
    const ok = permissions.some((p) => userPerms.includes(p));
    if (!ok) return next(new AppError("Permission denied.", 403));

    next();
  };
};


exports.checkUserPermission = (permissionTag) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new AppError("User not authenticated", 401));
    }

    const role = await Role.findById(req.user.role);

    if (!role) {
      return next(new AppError("User role not found", 403));
    }

    // 🔥 SuperAdmin override
    if (role.isSuperAdmin || role.permissions.includes("*")) {
      return next();
    }

    // 🔍 Check actual permission tag
    const hasPermission = role.permissions.includes(permissionTag);

    if (!hasPermission) {
      return next(
        new AppError(`You do not have permission: ${permissionTag}`, 403)
      );
    }

    next();
  };
};



// ======================================================
//  FORGOT PASSWORD
// ======================================================

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) return next(new AppError("Email is required.", 400));

  const user = await User.findOne({ email });
  if (!user) return next(new AppError("No user with that email.", 404));

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const url =
    (process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`) +
    `/auth/reset-password/${resetToken}`;

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

  res.status(200).json({
    status: "success",
    message: "Password reset email sent.",
  });
});

// ======================================================
//  RESET PASSWORD
// ======================================================

exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

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

  createSendToken(user, 200, res);
});

// ======================================================
//  UPDATE MY PASSWORD
// ======================================================

exports.updateMyPassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("+password");

  if (!user) return next(new AppError("User not found.", 404));

  if (!(await user.correctPassword(req.body.currentPassword, user.password)))
    return next(new AppError("Incorrect current password.", 401));

  user.password = req.body.newPassword;
  user.passwordConfirm = req.body.newPasswordConfirm;
  await user.save();

  createSendToken(user, 200, res);
});

// ======================================================
//  VERIFY TOKEN (Frontend Guard)
// ======================================================

exports.verifyToken = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer"))
    token = req.headers.authorization.split(" ")[1];
  else if (req.cookies?.jwt) token = req.cookies.jwt;

  if (!token) return next(new AppError("No token provided", 401));

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch {
    return next(new AppError("Invalid or expired token", 401));
  }

  const user = await User.findById(decoded.id).populate("role");
  if (!user) return next(new AppError("User no longer exists", 401));

  if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat))
    return next(new AppError("Password changed", 401));

  if (user.status !== "approved")
    return next(new AppError("User not active", 401));

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

const createSendToken = (user, statusCode, res) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false,        // LOCALHOST MUST BE FALSE
    sameSite: "lax",      // "none" only if you need cross-site POST forms
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  const safeUser = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role || null,
    status: user.status || null,
  };

  res.status(statusCode).json({
    status: "success",
    token: accessToken,
    data: { user: safeUser },
  });
};

// ======================================================
//  REFRESH TOKEN
// ======================================================

// exports.refreshToken = catchAsync(async (req, res, next) => {
//   const refreshToken = req.cookies.refreshToken;
//   if (!refreshToken)
//     return next(new AppError("No refresh token provided", 401));

//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(
//       refreshToken,
//       process.env.REFRESH_TOKEN_SECRET,
//     );
//   } catch {
//     return next(new AppError("Invalid refresh token", 401));
//   }

//   const user = await User.findById(decoded.id);
//   if (!user) return next(new AppError("User does not exist anymore", 401));

//   const newAccessToken = signAccessToken(user._id);
//   res.status(200).json({ status: "success", token: newAccessToken });
// });
// src/controllers/authController.js

exports.refreshToken = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return next(new AppError("No refresh token provided", 401));
  }

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch (err) {
    return next(new AppError("Invalid refresh token", 401));
  }

  // 1. Check if user exists
  const user = await User.findById(decoded.id);
  if (!user) {
    return next(new AppError("User does not exist anymore", 401));
  }

  // 2. 🔥 FIX: Check if a valid session exists for this user
  // Since your protect middleware requires a session, refresh must respect that.
  const sessionExists = await Session.findOne({
    userId: user._id,
    isValid: true
  });

  if (!sessionExists) {
    // If no session in DB, the user is technically logged out.
    // Clear the cookie to stop the client from trying again.
    res.cookie("refreshToken", "", {
      httpOnly: true,
      expires: new Date(0),
    });
    return next(new AppError("Session expired or revoked. Please login again.", 401));
  }

  // 3. Issue new token
  const newAccessToken = signAccessToken(user._id);

  // Optional: Update the session's last activity to keep it alive
  sessionExists.lastActivityAt = new Date();
  await sessionExists.save();

  res.status(200).json({
    status: "success",
    token: newAccessToken
  });
});

exports.logout = catchAsync(async (req, res, next) => {
  res.cookie("refreshToken", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    sameSite: "strict"
  });
  res.status(200).json({ status: "success", message: "Logged out successfully." });
});











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
// // ✅ IMPORT SOCKET HELPER
// const { emitToUser } = require("../utils/socket");

// // ======================================================
// //  HELPERS
// // ======================================================

// const createSendToken = (user, statusCode, res) => {
//   const accessToken = signAccessToken(user._id);
//   const refreshToken = signRefreshToken(user._id);

//   res.cookie("refreshToken", refreshToken, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "strict",
//     maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
//   });

//   const safeUser = {
//     id: user._id,
//     name: user.name,
//     email: user.email,
//     role: user.role || null,
//     status: user.status || null,
//   };

//   res.status(statusCode).json({
//     status: "success",
//     token: accessToken,
//     data: { user: safeUser },
//   });
// };

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
// //  REFRESH TOKEN
// // ======================================================

// exports.refreshToken = catchAsync(async (req, res, next) => {
//   const refreshToken = req.cookies.refreshToken;
//   if (!refreshToken)
//     return next(new AppError("No refresh token provided", 401));

//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(
//       refreshToken,
//       process.env.REFRESH_TOKEN_SECRET,
//     );
//   } catch {
//     return next(new AppError("Invalid refresh token", 401));
//   }

//   const user = await User.findById(decoded.id);
//   if (!user) return next(new AppError("User does not exist anymore", 401));

//   const newAccessToken = signAccessToken(user._id);
//   res.status(200).json({ status: "success", token: newAccessToken });
// });

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

//   // Populate owner so we can get their ID for the notification
//   const organization = await Organization.findOne({ uniqueShopId }).populate(
//     "owner",
//     "name email",
//   );

//   if (!organization) return next(new AppError("Invalid Shop ID", 404));

//   const newUser = await User.create({
//     name,
//     email,
//     password,
//     passwordConfirm,
//     organizationId: organization._id,
//     status: "pending",
//   });

//   // Push to approvalRequests as an object (Matching Schema)
//   organization.approvalRequests = organization.approvalRequests || [];
//   organization.approvalRequests.push({
//     userId: newUser._id,
//     email: newUser.email,
//     status: "pending",
//     requestedAt: new Date()
//   });

//   await organization.save();

//   // ✅ REAL-TIME NOTIFICATION TO OWNER
//   if (organization.owner && organization.owner._id) {
//     const ownerId = organization.owner._id.toString();

//     emitToUser(ownerId, "newNotification", {
//       title: "New Signup Request",
//       message: `${newUser.name} (${newUser.email}) has requested to join.`,
//       type: "info", // This triggers blue info icon
//       createdAt: new Date().toISOString(),
//     });
//   }

//   // Persist notification in DB (for History tab)
//   const io = req.app.get("io"); // Pass IO if needed by service, though service might use socket util internally now
//   await createNotification(
//     organization._id,
//     organization.owner._id,
//     "USER_SIGNUP",
//     "New Employee Signup Request",
//     `${name} (${email}) is waiting for approval.`,
//     io,
//   );

//   // Email Notification
//   try {
//     if (organization.owner?.email) {
//       await sendEmail({
//         email: organization.owner.email,
//         subject: "New Signup Request",
//         message: `${name} (${email}) requested to join your organization.`,
//       });
//     }
//   } catch { }

//   // Response to the User (They wait here)
//   res.status(201).json({
//     status: "success",
//     message: "Signup successful. Your account is pending admin approval.",
//   });
// });

// // ======================================================
// //  LOGIN
// // ======================================================

// exports.login = catchAsync(async (req, res, next) => {
//   const { email, password } = req.body;

//   if (!email || !password)
//     return next(new AppError("Email and password required.", 400));

//   const user = await User.findOne({ email }).select("+password");
//   if (!user || !(await user.correctPassword(password, user.password)))
//     return next(new AppError("Invalid credentials.", 401));

//   if (user.status !== "approved")
//     return next(new AppError("Account is not approved.", 401));

//   const token = signAccessToken(user._id);

//   const { browser, os, device } = getDeviceInfo(req);
//   const ip = getClientIp(req);

//   const session = await Session.create({
//     userId: user._id,
//     token,
//     isValid: true,
//     browser,
//     os,
//     deviceType: device,
//     ipAddress: ip,
//     organizationId: user.organizationId,
//     userAgent: req.headers["user-agent"] || null,
//   });

//   // Optional: Emit session event to user's other devices
//   const io = req.app.get("io");
//   if (io) {
//     io.to(user._id.toString()).emit("sessionCreated", {
//       sessionId: session._id,
//       token,
//       browser,
//       os,
//       device,
//       ip,
//       loginAt: session.createdAt,
//     });
//   }

//   user.password = undefined;

//   res.status(200).json({
//     status: "success",
//     token,
//     data: { user, session },
//   });
// });

// // ======================================================
// //  PROTECT (JWT AUTH)
// // ======================================================
// exports.protect = catchAsync(async (req, res, next) => {
//   let token;
//   if (req.headers.authorization?.startsWith("Bearer"))
//     token = req.headers.authorization.split(" ")[1];

//   if (!token) return next(new AppError("Not authenticated.", 401));

//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
//   } catch {
//     return next(new AppError("Invalid or expired token.", 401));
//   }

//   const user = await User.findById(decoded.id).populate("role");
//   if (!user) return next(new AppError("User no longer exists.", 401));

//   if (user.changedPasswordAfter(decoded.iat))
//     return next(new AppError("Password changed recently.", 401));

//   const session = await Session.findOne({
//     token,
//     userId: user._id,
//     isValid: true,
//   });

//   if (!session) return next(new AppError("Session revoked. Login again.", 401));

//   session.lastActivityAt = new Date();
//   await session.save();

//   req.user = user;
//   req.session = session;
//   req.user.permissions = user.role?.permissions || [];

//   next();
// });

// // ======================================================
// //  RESTRICT TO
// // ======================================================

// exports.restrictTo = (...permissions) => {
//   return (req, res, next) => {
//     if (!req.user) return next(new AppError("Not authorized.", 403));
//     const { role, permissions: userPerms } = req.user;
//     if (permissions.includes("superadmin") && role?.isSuperAdmin) return next();
//     const ok = permissions.some((p) => userPerms.includes(p));
//     if (!ok) return next(new AppError("Permission denied.", 403));

//     next();
//   };
// };


// exports.checkUserPermission = (permissionTag) => {
//   return async (req, res, next) => {
//     if (!req.user) {
//       return next(new AppError("User not authenticated", 401));
//     }

//     const role = await Role.findById(req.user.role);

//     if (!role) {
//       return next(new AppError("User role not found", 403));
//     }

//     // 🔥 SuperAdmin override
//     if (role.isSuperAdmin || role.permissions.includes("*")) {
//       return next();
//     }

//     // 🔍 Check actual permission tag
//     const hasPermission = role.permissions.includes(permissionTag);

//     if (!hasPermission) {
//       return next(
//         new AppError(`You do not have permission: ${permissionTag}`, 403)
//       );
//     }

//     next();
//   };
// };



// // ======================================================
// //  FORGOT PASSWORD
// // ======================================================

// exports.forgotPassword = catchAsync(async (req, res, next) => {
//   const { email } = req.body;

//   if (!email) return next(new AppError("Email is required.", 400));

//   const user = await User.findOne({ email });
//   if (!user) return next(new AppError("No user with that email.", 404));

//   const resetToken = user.createPasswordResetToken();
//   await user.save({ validateBeforeSave: false });

//   const url =
//     (process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`) +
//     `/auth/reset-password/${resetToken}`;

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

//   res.status(200).json({
//     status: "success",
//     message: "Password reset email sent.",
//   });
// });

// // ======================================================
// //  RESET PASSWORD
// // ======================================================

// exports.resetPassword = catchAsync(async (req, res, next) => {
//   const hashedToken = crypto
//     .createHash("sha256")
//     .update(req.params.token)
//     .digest("hex");

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

//   createSendToken(user, 200, res);
// });

// // ======================================================
// //  UPDATE MY PASSWORD
// // ======================================================

// exports.updateMyPassword = catchAsync(async (req, res, next) => {
//   const user = await User.findById(req.user.id).select("+password");

//   if (!user) return next(new AppError("User not found.", 404));

//   if (!(await user.correctPassword(req.body.currentPassword, user.password)))
//     return next(new AppError("Incorrect current password.", 401));

//   user.password = req.body.newPassword;
//   user.passwordConfirm = req.body.newPasswordConfirm;
//   await user.save();

//   createSendToken(user, 200, res);
// });

// // ======================================================
// //  VERIFY TOKEN (Frontend Guard)
// // ======================================================

// exports.verifyToken = catchAsync(async (req, res, next) => {
//   let token;

//   if (req.headers.authorization?.startsWith("Bearer"))
//     token = req.headers.authorization.split(" ")[1];
//   else if (req.cookies?.jwt) token = req.cookies.jwt;

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

// exports.logout = catchAsync(async (req, res, next) => {
//   res.cookie("refreshToken", "", {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     expires: new Date(0),
//     sameSite: "strict"
//   });
//   res.status(200).json({ status: "success", message: "Logged out successfully." });
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

// // // ======================================================
// // //  HELPERS
// // // ======================================================

// // const createSendToken = (user, statusCode, res) => {
// //   const accessToken = signAccessToken(user._id);
// //   const refreshToken = signRefreshToken(user._id);

// //   res.cookie("refreshToken", refreshToken, {
// //     httpOnly: true,
// //     secure: process.env.NODE_ENV === "production",
// //     sameSite: "strict",
// //     maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
// //   });

// //   const safeUser = {
// //     id: user._id,
// //     name: user.name,
// //     email: user.email,
// //     role: user.role || null,
// //     status: user.status || null,
// //   };

// //   res.status(statusCode).json({
// //     status: "success",
// //     token: accessToken,
// //     data: { user: safeUser },
// //   });
// // };

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
// // //  REFRESH TOKEN
// // // ======================================================

// // exports.refreshToken = catchAsync(async (req, res, next) => {
// //   const refreshToken = req.cookies.refreshToken;
// //   if (!refreshToken)
// //     return next(new AppError("No refresh token provided", 401));

// //   let decoded;
// //   try {
// //     decoded = await promisify(jwt.verify)(
// //       refreshToken,
// //       process.env.REFRESH_TOKEN_SECRET,
// //     );
// //   } catch {
// //     return next(new AppError("Invalid refresh token", 401));
// //   }

// //   const user = await User.findById(decoded.id);
// //   if (!user) return next(new AppError("User does not exist anymore", 401));

// //   const newAccessToken = signAccessToken(user._id);
// //   res.status(200).json({ status: "success", token: newAccessToken });
// // });

// // // ======================================================
// // //  SIGNUP (EMPLOYEE)
// // // ======================================================

// // exports.signup = catchAsync(async (req, res, next) => {
// //   const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

// //   if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
// //     return next(new AppError("All fields are required", 400));

// //   if (password !== passwordConfirm)
// //     return next(new AppError("Passwords do not match", 400));

// //   const existingUser = await User.findOne({ email });
// //   if (existingUser && existingUser.status !== "pending")
// //     return next(new AppError("Email already in use", 400));

// //   const organization = await Organization.findOne({ uniqueShopId }).populate(
// //     "owner",
// //     "name email",
// //   );

// //   if (!organization) return next(new AppError("Invalid Shop ID", 404));

// //   const newUser = await User.create({
// //     name,
// //     email,
// //     password,
// //     passwordConfirm,
// //     organizationId: organization._id,
// //     status: "pending",
// //   });

// //   organization.approvalRequests = organization.approvalRequests || [];
// //   organization.approvalRequests.push(newUser._id);
// //   await organization.save();

// //   const io = req.app.get("io");
// //   if (io && organization.owner?._id) {
// //     io.to(organization.owner._id.toString()).emit("newNotification", {
// //       title: "New Signup Request",
// //       message: `${newUser.name} has signed up.`,
// //       createdAt: new Date().toISOString(),
// //     });
// //   }

// //   await createNotification(
// //     organization._id,
// //     organization.owner._id,
// //     "USER_SIGNUP",
// //     "New Employee Signup Request",
// //     `${name} (${email}) is waiting for approval.`,
// //     io,
// //   );

// //   try {
// //     if (organization.owner?.email) {
// //       await sendEmail({
// //         email: organization.owner.email,
// //         subject: "New Signup Request",
// //         message: `${name} (${email}) requested to join your organization.`,
// //       });
// //     }
// //   } catch {}

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

// //   const user = await User.findOne({ email }).select("+password");
// //   if (!user || !(await user.correctPassword(password, user.password)))
// //     return next(new AppError("Invalid credentials.", 401));

// //   if (user.status !== "approved")
// //     return next(new AppError("Account is not approved.", 401));

// //   const token = signAccessToken(user._id);

// //   const { browser, os, device } = getDeviceInfo(req);
// //   const ip = getClientIp(req);

// //   const session = await Session.create({
// //     userId: user._id,
// //     token,
// //     isValid: true,
// //     browser,
// //     os,
// //     deviceType: device,
// //     ipAddress: ip,
// //     organizationId: user.organizationId,
// //     userAgent: req.headers["user-agent"] || null,
// //   });

// //   const io = req.app.get("io");
// //   if (io) {
// //     io.to(user._id.toString()).emit("sessionCreated", {
// //       sessionId: session._id,
// //       token,
// //       browser,
// //       os,
// //       device,
// //       ip,
// //       loginAt: session.createdAt,
// //     });
// //   }

// //   user.password = undefined;

// //   res.status(200).json({
// //     status: "success",
// //     token,
// //     data: { user, session },
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

// //   const session = await Session.findOne({
// //     token,
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

// // exports.logout = catchAsync(async (req, res, next) => {
// //   res.cookie("refreshToken", "", {
// //     httpOnly: true,
// //     secure: process.env.NODE_ENV === "production",
// //     expires: new Date(0),
// //     sameSite: "strict"
// //   });
// //   res.status(200).json({ status: "success", message: "Logged out successfully." });
// // });

