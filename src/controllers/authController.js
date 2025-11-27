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

// ======================================================
//  HELPERS
// ======================================================

const createSendToken = (user, statusCode, res) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
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
//  REFRESH TOKEN
// ======================================================

exports.refreshToken = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken)
    return next(new AppError("No refresh token provided", 401));

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );
  } catch {
    return next(new AppError("Invalid refresh token", 401));
  }

  const user = await User.findById(decoded.id);
  if (!user) return next(new AppError("User does not exist anymore", 401));

  const newAccessToken = signAccessToken(user._id);
  res.status(200).json({ status: "success", token: newAccessToken });
});

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

  organization.approvalRequests = organization.approvalRequests || [];
  organization.approvalRequests.push(newUser._id);
  await organization.save();

  const io = req.app.get("io");
  if (io && organization.owner?._id) {
    io.to(organization.owner._id.toString()).emit("newNotification", {
      title: "New Signup Request",
      message: `${newUser.name} has signed up.`,
      createdAt: new Date().toISOString(),
    });
  }

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
  } catch {}

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

  const token = signAccessToken(user._id);

  const { browser, os, device } = getDeviceInfo(req);
  const ip = getClientIp(req);

  const session = await Session.create({
    userId: user._id,
    token,
    isValid: true,
    browser,
    os,
    deviceType: device,
    ipAddress: ip,
    organizationId: user.organizationId,
    userAgent: req.headers["user-agent"] || null,
  });

  const io = req.app.get("io");
  if (io) {
    io.to(user._id.toString()).emit("sessionCreated", {
      sessionId: session._id,
      token,
      browser,
      os,
      device,
      ip,
      loginAt: session.createdAt,
    });
  }

  user.password = undefined;

  res.status(200).json({
    status: "success",
    token,
    data: { user, session },
  });
});

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

  const session = await Session.findOne({
    token,
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

exports.logout = catchAsync(async (req, res, next) => {
  res.cookie("refreshToken", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    sameSite: "strict"
  });
  res.status(200).json({ status: "success", message: "Logged out successfully." });
});


// // const createSendToken = (user, statusCode, res) => {
// //   const token = signToken(user);
// //   // sanitize user object before sending
// //   const safeUser = {
// //     id: user._id,
// //     name: user.name,
// //     email: user.email,
// //     role: user.role || null,
// //     status: user.status || null,
// //   };
// //   res.status(statusCode).json({
// //     status: "success",
// //     token,
// //     data: { user: safeUser },
// //   });
// // };
// // src/controllers/authController.js

// const { promisify } = require("util");
// const jwt = require("jsonwebtoken");
// const crypto = require("crypto");
// const User = require("../models/userModel");
// const Organization = require("../models/organizationModel");
// const Role = require("../models/roleModel");
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const { signAccessToken, signRefreshToken } = require("../utils/authUtils");
// const sendEmail = require("../utils/email");
// const { createNotification } = require("../services/notificationService");
// const Session = require('../models/sessionModel');
// const uaParser = require("ua-parser-js"); // npm i ua-parser-js

// // ======================================================
// // 🧩 HELPER: Create and Send JWT
// // ======================================================

// const createSendToken = (user, statusCode, res) => {

//   const accessToken = signAccessToken(user._id);
//   const refreshToken = signRefreshToken(user._id);

//   // Send refresh token in secure cookie
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

// exports.refreshToken = catchAsync(async (req, res, next) => {
//   const refreshToken = req.cookies.refreshToken;

//   if (!refreshToken)
//     return next(new AppError("No refresh token provided", 401));

//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(
//       refreshToken,
//       process.env.REFRESH_TOKEN_SECRET
//     );
//   } catch (err) {
//     return next(new AppError("Invalid refresh token", 401));
//   }

//   const user = await User.findById(decoded.id);
//   if (!user)
//     return next(new AppError("User does not exist anymore", 401));

//   const newAccessToken = signAccessToken(user._id);

//   res.status(200).json({
//     status: "success",
//     token: newAccessToken,
//   });
// });

// // ======================================================
// // 🧩 SIGNUP (Employee)
// // ======================================================
// exports.signup = catchAsync(async (req, res, next) => {
//   const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

//   if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
//     return next(new AppError("All fields are required", 400));

//   if (password !== passwordConfirm)
//     return next(new AppError("Passwords do not match", 400));

//   // Check for existing user with same email
//   const existingUser = await User.findOne({ email });
//   if (existingUser && existingUser.status !== "pending") {
//     return next(new AppError("Email already in use. Please login instead.", 400));
//   }

//   // Find the organization
//   const organization = await Organization.findOne({ uniqueShopId }).populate(
//     "owner",
//     "name email"
//   );
//   if (!organization)
//     return next(new AppError("Invalid Shop ID — organization not found.", 404));

//   // Create pending user
//   const newUser = await User.create({
//     name,
//     email,
//     password,
//     passwordConfirm,
//     organizationId: organization._id,
//     status: "pending",
//   });

//   // Add to approval queue
//   organization.approvalRequests = organization.approvalRequests || [];
//   organization.approvalRequests.push(newUser._id);
//   await organization.save();

//   // Emit live notification to owner (if socket exists)
//   const io = req.app.get("io");
//   if (io && organization.owner?._id) {
//     io.to(organization.owner._id.toString()).emit("newNotification", {
//       title: "New Signup Request",
//       message: `${newUser.name} has signed up and is waiting for approval.`,
//       createdAt: new Date().toISOString(),
//     });
//   }

//   // Create persistent notification
//   await createNotification(
//     organization._id,
//     organization.owner._id,
//     "USER_SIGNUP",
//     "New Employee Signup Request",
//     `${name} (${email}) has requested to join your organization.`,
//     io
//   );

//   // Optional email alert to owner
//   if (organization.owner?.email) {
//     try {
//       await sendEmail({
//         email: organization.owner.email,
//         subject: "New Employee Signup Request",
//         message: `Hello ${organization.owner.name},

// ${name} (${email}) has requested to join your organization (${organization.name}).
// Please review and approve them in your dashboard.

// – Shivam Electronics CRM`,
//       });
//     } catch (err) {
//       // Log but don't fail signup because of email failure
//       console.warn("⚠️ Failed to send signup notification email:", err.message);
//     }
//   }

//   res.status(201).json({
//     status: "success",
//     message: "Signup successful! Your account is pending approval from the admin.",
//   });
// });

// // ======================================================
// // 🧩 LOGIN
// // ======================================================

// exports.login = catchAsync(async (req, res, next) => {
//   const { email, password } = req.body;

//   if (!email || !password)
//     return next(new AppError("Email and password required.", 400));

//   // 1. Fetch user
//   const user = await User.findOne({ email }).select("+password");
//   if (!user || !(await user.correctPassword(password, user.password)))
//     return next(new AppError("Invalid credentials.", 401));

//   if (user.status !== "approved")
//     return next(new AppError("Account is not approved.", 401));

//   // 2. Generate JWT
//   const token = signAccessToken(user._id);

//   // 3. Parse device info
//   const parser = new UAParser(req.headers["user-agent"] || "");
//   const browser = parser.getBrowser()?.name || "unknown";
//   const os = parser.getOS()?.name || "unknown";
//   const device = parser.getDevice()?.model || "unknown";

//   // 4. Determine IP
//   const ip =
//     req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
//     req.socket?.remoteAddress ||
//     req.ip;

//   // 5. Create session
//   const session = await Session.create({
//     userId: user._id,
//     token,
//     isValid: true,
//     browser,
//     os,
//     deviceType: device,
//     ipAddress: ip,
//     userAgent: req.headers["user-agent"] || null,
//   });

//   // 6. Emit socket event (only if user is connected)
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

//   // 7. Clean sensitive info
//   user.password = undefined;

//   // 8. Send response
//   res.status(200).json({
//     status: "success",
//     token,
//     data: { user, session },
//   });
// });

// // const MAX_SESSIONS = Number(process.env.MAX_SESSIONS_PER_USER || 5);
// // exports.login = catchAsync(async (req, res, next) => {
// //   const { email, password } = req.body;

// //   // 1️⃣ Validate input
// //   if (!email || !password) {
// //     return next(new AppError("Email and password required.", 400));
// //   }

// //   // 2️⃣ Find user + check password
// //   const user = await User.findOne({ email }).select("+password");
// //   if (!user) return next(new AppError("Invalid credentials.", 401));

// //   const correct = await user.correctPassword(password, user.password);
// //   if (!correct) return next(new AppError("Invalid credentials.", 401));

// //   // 3️⃣ Check status
// //   if (user.status !== "approved") {
// //     return next(new AppError("Account is not approved.", 401));
// //   }

// //   // 4️⃣ Create JWT
// //   const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
// //     expiresIn: "7d",
// //   });

// //   // 5️⃣ Parse device info properly
// //   const parser = new UAParser(req.headers["user-agent"] || "");
// //   const device = parser.getDevice();
// //   const browser = parser.getBrowser();
// //   const os = parser.getOS();

// //   // 6️⃣ Safer IP handling
// //   const ipAddress =
// //     req.ip ||
// //     req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
// //     req.socket?.remoteAddress ||
// //     null;

// //   // 7️⃣ Create session
// //   const session = await Session.create({
// //     userId: user._id,
// //     token,
// //     deviceType: device.type || "unknown",
// //     deviceModel: device.model || "unknown",
// //     browser: browser.name || "unknown",
// //     os: os.name || "unknown",
// //     ipAddress,
// //     userAgent: req.headers["user-agent"] || null,
// //     isValid: true,
// //   });

// //   // 8️⃣ Send socket event
// //   const io = req.app.get("io");
// //   if (io) {
// //     io.to(user._id.toString()).emit("sessionCreated", {
// //       sessionId: session._id,
// //       token,
// //       device: session.deviceModel,
// //       browser: session.browser,
// //       os: session.os,
// //       ip: session.ipAddress,
// //       loginAt: session.createdAt,
// //     });
// //   }

// //   // 9️⃣ Remove password before sending
// //   user.password = undefined;

// //   // 🔟 Send response
// //   res.status(200).json({
// //     status: "success",
// //     token,
// //     data: { user, session },
// //   });
// // });
// // ======================================================
// // 🧩 PROTECT (JWT Middleware)
// // ======================================================
// exports.protect = catchAsync(async (req, res, next) => {
//   let token;

//   if (req.headers.authorization?.startsWith("Bearer"))
//     token = req.headers.authorization.split(" ")[1];

//   if (!token) return next(new AppError("Not authenticated.", 401));

//   // Decode JWT
//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
//   } catch (err) {
//     return next(new AppError("Invalid or expired token.", 401));
//   }

//   // Fetch user
//   const user = await User.findById(decoded.id).populate("role");
//   if (!user) return next(new AppError("User no longer exists.", 401));

//   // Check password change
//   if (user.changedPasswordAfter(decoded.iat))
//     return next(new AppError("Password changed recently. Login again.", 401));

//   // Validate session
//   const session = await Session.findOne({
//     token,
//     userId: user._id,
//     isValid: true,
//   });

//   if (!session)
//     return next(new AppError("Session revoked. Login again.", 401));

//   // Update last active
//   session.lastActivityAt = new Date();
//   await session.save();

//   req.user = user;
//   req.session = session;
//   req.user.permissions = user.role?.permissions || [];

//   next();
// });

// // exports.protect = catchAsync(async (req, res, next) => {
// //   // 1️⃣ Extract token
// //   let token;
// //   if (req.headers.authorization?.startsWith("Bearer"))
// //     token = req.headers.authorization.split(" ")[1];

// //   if (!token)
// //     return next(new AppError("Not authenticated — login required.", 401));

// //   // 2️⃣ Verify JWT
// //   let decoded;
// //   try {
// //     decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
// //   } catch (err) {
// //     return next(new AppError("Invalid or expired token.", 401));
// //   }

// //   // 3️⃣ Verify if user still exists
// //   const currentUser = await User.findById(decoded.id).populate("role");
// //   if (!currentUser)
// //     return next(new AppError("User no longer exists.", 401));

// //   // 4️⃣ Check if password changed after token issue
// //   if (currentUser.changedPasswordAfter && currentUser.changedPasswordAfter(decoded.iat))
// //     return next(new AppError("Password changed — please log in again.", 401));

// //   // 5️⃣ Check if user is active/approved
// //   if (currentUser.status !== "approved")
// //     return next(new AppError("Account not approved or disabled.", 401));

// //   // 6️⃣ 🔒 Validate session (critical)
// //   const session = await Session.findOne({
// //     token,
// //     userId: currentUser._id,
// //     isValid: true,
// //   });

// //   if (!session)
// //     return next(new AppError("Session revoked — please log in again.", 401));

// //   // 7️⃣ Update last activity timestamp (optional but recommended)
// //   session.lastActivityAt = new Date();
// //   await session.save();

// //   // 8️⃣ Attach user & session to req
// //   req.user = currentUser;
// //   req.session = session;
// //   req.user.permissions = currentUser.role?.permissions || [];

// //   next();
// // });

// // ======================================================
// // 🧩 Restric to
// // ======================================================
// exports.restrictTo = (...permissions) => {
//   return (req, res, next) => {
//     if (!req.user) return next(new AppError("You are not authorized.", 403));

//     const { role, permissions: userPermissions } = req.user;

//     if (permissions.includes("superadmin") && role?.isSuperAdmin) return next();

//     const hasPermission = permissions.some((p) => userPermissions.includes(p));
//     if (!hasPermission) return next(new AppError("You do not have permission to perform this action.", 403));

//     next();
//   };
// };

// // ======================================================
// // 🧩 FORGOT PASSWORD
// // ======================================================
// exports.forgotPassword = catchAsync(async (req, res, next) => {
//   const { email } = req.body;
//   if (!email) return next(new AppError("Please provide an email address.", 400));

//   const user = await User.findOne({ email });
//   if (!user) return next(new AppError("There is no user with that email address.", 404));

//   // Generate reset token via model helper
//   const resetToken = user.createPasswordResetToken();
//   await user.save({ validateBeforeSave: false });

//   const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
//   const resetURL = `${frontendUrl}/auth/reset-password/${resetToken}`;
//   const message = `Forgot your password? Reset it here: ${resetURL}\nIf you didn't request this, ignore this email.`;

//   try {
//     await sendEmail({
//       email: user.email,
//       subject: "Your password reset link (valid for 10 minutes)",
//       message,
//     });

//     res.status(200).json({
//       status: "success",
//       message: "Password reset link sent to your email.",
//     });
//   } catch (err) {
//     // cleanup on fail
//     user.passwordResetToken = undefined;
//     user.passwordResetExpires = undefined;
//     await user.save({ validateBeforeSave: false });
//     return next(new AppError("Error sending email. Try again later.", 500));
//   }
// });

// // ======================================================
// // 🧩 RESET PASSWORD
// // ======================================================
// exports.resetPassword = catchAsync(async (req, res, next) => {
//   const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");
//   const user = await User.findOne({
//     passwordResetToken: hashedToken,
//     passwordResetExpires: { $gt: Date.now() },
//   });

//   if (!user) return next(new AppError("Token is invalid or expired.", 400));

//   user.password = req.body.password;
//   user.passwordConfirm = req.body.passwordConfirm;
//   user.passwordResetToken = undefined;
//   user.passwordResetExpires = undefined;
//   await user.save();

//   createSendToken(user, 200, res);
// });

// // ======================================================
// // 🧩 UPDATE PASSWORD (LOGGED-IN USER)
// // ======================================================
// exports.updateMyPassword = catchAsync(async (req, res, next) => {
//   const user = await User.findById(req.user.id).select("+password");

//   if (!user) return next(new AppError("User not found.", 404));

//   if (!(await user.correctPassword(req.body.currentPassword, user.password)))
//     return next(new AppError("Your current password is incorrect.", 401));

//   user.password = req.body.newPassword;
//   user.passwordConfirm = req.body.newPasswordConfirm;
//   await user.save();

//   createSendToken(user, 200, res);
// });

// // ======================================================
// // 🧩 VERIFY TOKEN
// // ======================================================
// exports.verifyToken = catchAsync(async (req, res, next) => {
//   let token;
//   if (req.headers.authorization?.startsWith("Bearer")) {
//     token = req.headers.authorization.split(" ")[1];
//   } else if (req.cookies?.jwt) {
//     token = req.cookies.jwt;
//   }

//   if (!token) return next(new AppError("No token provided", 401));

//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
//   } catch (err) {
//     return next(new AppError("Invalid or expired token", 401));
//   }

//   const currentUser = await User.findById(decoded.id).populate("role");
//   if (!currentUser) return next(new AppError("User no longer exists", 401));

//   if (currentUser.changedPasswordAfter && currentUser.changedPasswordAfter(decoded.iat))
//     return next(new AppError("User recently changed password", 401));

//   if (currentUser.status !== "approved")
//     return next(new AppError("User account not active", 401));

//   return res.status(200).json({
//     status: "success",
//     data: {
//       user: {
//         id: currentUser._id,
//         name: currentUser.name,
//         email: currentUser.email,
//         role: currentUser.role?.name ?? null,
//         permissions: currentUser.role?.permissions ?? [],
//       },
//     },
//   });
// });

// // exports.protect = catchAsync(async (req, res, next) => {
// //   let token;
// //   if (req.headers.authorization?.startsWith("Bearer"))
// //     token = req.headers.authorization.split(" ")[1];

// //   if (!token)
// //     return next(new AppError("You are not logged in! Please log in.", 401));

// //   const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

// //   const currentUser = await User.findById(decoded.id).populate("role");
// //   if (!currentUser)
// //     return next(new AppError("The user belonging to this token no longer exists.", 401));

// //   if (currentUser.changedPasswordAfter && currentUser.changedPasswordAfter(decoded.iat))
// //     return next(new AppError("User recently changed password! Please log in again.", 401));

// //   if (currentUser.status !== "approved")
// //     return next(new AppError("This user account is not active.", 401));

// //   req.user = currentUser;
// //   req.user.permissions = currentUser.role?.permissions || [];
// //   next();
// // });

// // exports.login = catchAsync(async (req, res, next) => {
// //   const { email, password } = req.body;

// //   // 1. Require credentials
// //   if (!email || !password) {
// //     return next(new AppError("Please provide email and password!", 400));
// //   }

// //   // 2. Find user + password + role
// //   const user = await User.findOne({ email })
// //     .select("+password")
// //     .populate("role");

// //   if (!user || !(await user.correctPassword(password, user.password))) {
// //     return next(new AppError("Incorrect email or password", 401));
// //   }

// //   // 3. Status checks
// //   if (user.status === "pending") {
// //     return next(new AppError("Your account is still pending approval.", 401));
// //   }

// //   if (user.status !== "approved") {
// //     return next(new AppError("This user account is inactive.", 401));
// //   }

// //   // 4. Generate JWT
// //   const token = signToken(user);

// //   // 5. Limit number of active sessions
// //   const activeCount = await Session.countDocuments({
// //     userId: user._id,
// //     isValid: true,
// //   });

// //   if (activeCount >= MAX_SESSIONS) {
// //     return next(
// //       new AppError(
// //         "Too many active sessions. Please logout from other devices or contact admin.",
// //         403
// //       )
// //     );
// //   }

// //   // 6. Parse UA details
// //   const parser = new UAParser(req.headers["user-agent"] || "");
// //   const device = parser.getDevice();
// //   const browser = parser.getBrowser();
// //   const os = parser.getOS();

// //   // 7. Get IP safely
// //   const ipAddress =
// //     req.ip ||
// //     req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
// //     req.socket?.remoteAddress ||
// //     null;

// //   // 8. Create session entry
// //   await Session.create({
// //     userId: user._id,
// //     organizationId: user.organizationId,
// //     token,
// //     device: device.model || "Unknown",
// //     browser: browser.name || "Unknown",
// //     os: os.name || "Unknown",
// //     ipAddress,
// //     userAgent: req.headers["user-agent"] || null,
// //     lastActivityAt: new Date(),
// //     isValid: true,
// //   });

// //   // 9. Cleanup
// //   user.password = undefined;

// //   // 10. Send final response
// //   res.status(200).json({
// //     status: "success",
// //     token,
// //     data: { user },
// //   });
// //   this.notificationService.connect(user._id); // open socket and register

// // });
// // // exports.login = catchAsync(async (req, res, next) => {
// // //   const { email, password } = req.body;

// // //   // 1. Check if email & password exist
// // //   if (!email || !password) {
// // //     return next(new AppError("Please provide email and password!", 400));
// // //   }

// // //   // 2. Find user + include password + include role
// // //   const user = await User.findOne({ email })
// // //     .select("+password")
// // //     .populate("role");

// // //   if (!user || !(await user.correctPassword(password, user.password))) {
// // //     return next(new AppError("Incorrect email or password", 401));
// // //   }

// // //   // 3. Account status checks (from old code)
// // //   if (user.status === "pending") {
// // //     return next(new AppError("Your account is still pending approval.", 401));
// // //   }

// // //   if (user.status !== "approved") {
// // //     return next(new AppError("This user account is inactive.", 401));
// // //   }

// // //   // 4. Create JWT
// // //   const token = signToken(user);

// // //   // 5. Store session
// // //   const ua = uaParser(req.headers["user-agent"]);

// // //   await Session.create({
// // //     userId: user._id,
// // //     organizationId: user.organizationId,
// // //     token,
// // //     device: ua.device.model || "Unknown",
// // //     browser: ua.browser.name || "Unknown",
// // //     os: ua.os.name || "Unknown",
// // //     ipAddress: req.ip,
// // //     lastActivityAt: new Date()
// // //   });

// // //   // 6. Return token + user
// // //   createSendToken(user, 200, res, token);
// // // });
// // // // exports.login = catchAsync(async (req, res, next) => {
// // // //   const { email, password } = req.body;

// // // //   if (!email || !password)
// // // //     return next(new AppError("Please provide email and password!", 400));

// // // //   const user = await User.findOne({ email }).select("+password").populate("role");

// // // //   if (!user || !(await user.correctPassword(password, user.password)))
// // // //     return next(new AppError("Incorrect email or password", 401));

// // // //   if (user.status === "pending")
// // // //     return next(new AppError("Your account is still pending approval.", 401));

// // // //   if (user.status !== "approved")
// // // //     return next(new AppError("This user account is inactive.", 401));

// // // //   createSendToken(user, 200, res);
// // // // });

// // ======================================================
// // 🧩 RESTRICT TO
// // ======================================================

// // ////////////////////////////////////////////////////////////////
// // const { promisify } = require("util");
// // const jwt = require("jsonwebtoken");
// // const crypto = require("crypto");
// // const User = require("../models/userModel");
// // const Organization = require("../models/organizationModel");
// // const Role = require("../models/roleModel");
// // const catchAsync = require("../utils/catchAsync");
// // const AppError = require("../utils/appError");
// // const { signToken } = require("../utils/authUtils");
// // const sendEmail = require("../utils/email");
// // const { createNotification } = require("../services/notificationService");

// // // ======================================================
// // // 🧩 HELPER: Create and Send JWT
// // // ======================================================
// // const createSendToken = (user, statusCode, res) => {
// //   const token = signToken(user);
// //   user.password = undefined;
// //   res.status(statusCode).json({
// //     status: "success",
// //     token,
// //     data: { user },
// //   });
// // };

// // // ======================================================
// // // 🧩 SIGNUP (Employee)
// // // ======================================================
// // exports.signup = catchAsync(async (req, res, next) => {
// //   const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

// //   if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
// //     return next(new AppError("All fields are required", 400));

// //   if (password !== passwordConfirm)
// //     return next(new AppError("Passwords do not match", 400));

// //   // Check for existing user with same email
// //   const existingUser = await User.findOne({ email });
// //   if (existingUser && existingUser.status !== "pending") {
// //     return next(new AppError("Email already in use. Please login instead.", 400));
// //   }

// //   // Find the organization
// //   const organization = await Organization.findOne({ uniqueShopId }).populate(
// //     "owner",
// //     "name email"
// //   );
// //   if (!organization)
// //     return next(new AppError("Invalid Shop ID — organization not found.", 404));

// //   // Create pending user
// //   const newUser = await User.create({
// //     name,
// //     email,
// //     password,
// //     passwordConfirm,
// //     organizationId: organization._id,
// //     status: "pending",
// //   });

// //   // Add to approval queue
// //   organization.approvalRequests.push(newUser._id);
// //   await organization.save();

// //   // ✅ Emit live notification to owner
// //   const io = req.app.get("io");
// //   if (io && organization.owner?._id) {
// //     io.to(organization.owner._id.toString()).emit("newNotification", {
// //       title: "New Signup Request",
// //       message: `${newUser.name} has signed up and is waiting for approval.`,
// //       createdAt: new Date().toISOString(),
// //     });
// //     console.log(`📡 Notification emitted to ${organization.owner._id}`);
// //   }

// //   // ✅ Create persistent notification
// //   await createNotification(
// //     organization._id,
// //     organization.owner._id,
// //     "USER_SIGNUP",
// //     "New Employee Signup Request",
// //     `${name} (${email}) has requested to join your organization.`,
// //     io
// //   );

// //   // ✅ Optional email alert
// //   if (organization.owner?.email) {
// //     try {
// //       await sendEmail({
// //         email: organization.owner.email,
// //         subject: "New Employee Signup Request",
// //         message: `Hello ${organization.owner.name},

// // ${name} (${email}) has requested to join your organization (${organization.name}).
// // Please review and approve them in your dashboard.

// // – Shivam Electronics CRM`,
// //         section
// //       });
// //     } catch (err) {
// //       console.warn("⚠️ Failed to send signup notification email:", err.message);
// //     }
// //   }

// //   res.status(201).json({
// //     status: "success",
// //     message: "Signup successful! Your account is pending approval from the admin.",
// //   });
// // });

// // // ======================================================
// // // 🧩 LOGIN
// // // ======================================================
// // exports.login = catchAsync(async (req, res, next) => {
// //   const { email, password } = req.body;

// //   if (!email || !password)
// //     return next(new AppError("Please provide email and password!", 400));

// //   const user = await User.findOne({ email }).select("+password").populate("role");

// //   if (!user || !(await user.correctPassword(password, user.password)))
// //     return next(new AppError("Incorrect email or password", 401));

// //   if (user.status === "pending")
// //     return next(new AppError("Your account is still pending approval.", 401));

// //   if (user.status !== "approved")
// //     return next(new AppError("This user account is inactive.", 401));

// //   createSendToken(user, 200, res);
// // });

// // // ======================================================
// // // 🧩 PROTECT (JWT Middleware)
// // // ======================================================
// // exports.protect = catchAsync(async (req, res, next) => {
// //   let token;
// //   if (req.headers.authorization?.startsWith("Bearer"))
// //     token = req.headers.authorization.split(" ")[1];

// //   if (!token)
// //     return next(new AppError("You are not logged in! Please log in.", 401));

// //   const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

// //   const currentUser = await User.findById(decoded.id).populate("role");
// //   if (!currentUser)
// //     return next(new AppError("The user belonging to this token no longer exists.", 401));

// //   if (currentUser.changedPasswordAfter(decoded.iat))
// //     return next(new AppError("User recently changed password! Please log in again.", 401));

// //   if (currentUser.status !== "approved")
// //     return next(new AppError("This user account is not active.", 401));

// //   req.user = currentUser;
// //   req.user.permissions = currentUser.role?.permissions || [];
// //   next();
// // });

// // // ======================================================
// // // 🧩 RESTRICT TO
// // // ======================================================
// // exports.restrictTo = (...permissions) => {
// //   return (req, res, next) => {
// //     if (!req.user)
// //       return next(new AppError("You are not authorized.", 403));

// //     const { role, permissions: userPermissions } = req.user;

// //     if (permissions.includes("superadmin") && role?.isSuperAdmin)
// //       return next();

// //     const hasPermission = permissions.some((p) => userPermissions.includes(p));
// //     if (!hasPermission)
// //       return next(new AppError("You do not have permission to perform this action.", 403));

// //     next();
// //   };
// // };

// // // ======================================================
// // // 🧩 FORGOT PASSWORD
// // // ======================================================
// // exports.forgotPassword = catchAsync(async (req, res, next) => {
// //   const { email } = req.body;

// //   const user = await User.findOne({ email });
// //   if (!user)
// //     return next(new AppError("There is no user with that email address.", 404));

// //   // Generate reset token
// //   const resetToken = user.createPasswordResetToken();
// //   await user.save({ validateBeforeSave: false });

// //   const resetURL = `${process.env.FRONTEND_URL}/auth/reset-password/${resetToken}`;
// //   const message = `Forgot your password? Reset it here: ${resetURL}\nIf you didn't request this, ignore this email.`;

// //   try {
// //     await sendEmail({
// //       email: user.email,
// //       subject: "Your password reset link (valid for 10 minutes)",
// //       message,
// //     });

// //     res.status(200).json({
// //       status: "success",
// //       message: "Password reset link sent to your email.",
// //       CSS
// //     });
// //   } catch (err) {
// //     user.passwordResetToken = undefined;
// //     user.passwordResetExpires = undefined;
// //     await user.save({ validateBeforeSave: false });
// //     return next(new AppError("Error sending email. Try again later.", 500));
// //   }
// // });

// // // ======================================================
// // // 🧩 RESET PASSWORD
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

// //   if (!user)
// //     return next(new AppError("Token is invalid or expired.", 400))
// //   user.password = req.body.password;
// //   user.passwordConfirm = req.body.passwordConfirm;
// //   user.passwordResetToken = undefined;
// //   user.passwordResetExpires = undefined;
// //   await user.save();

// //   createSendToken(user, 200, res);
// // });

// // // ======================================================
// // // 🧩 UPDATE PASSWORD (LOGGED-IN USER)
// // // ======================================================
// // exports.updateMyPassword = catchAsync(async (req, res, next) => {
// //   const user = await User.findById(req.user.id).select("+password");

// //   if (!(await user.correctPassword(req.body.currentPassword, user.password)))
// //     return next(new AppError("Your current password is incorrect.", 401));

// //   user.password = req.body.newPassword;
// //   user.passwordConfirm = req.body.newPasswordConfirm;
// //   await user.save();

// //   createSendToken(user, 200, res);
// // });
