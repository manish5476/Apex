const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const UAParser = require("ua-parser-js");

const User = require("./user.model");
const Organization = require("../../organization/core/organization.model");
const Role = require("./role.model");
const Session = require("./session.model");

const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const sendEmail = require("../../../core/utils/_legacy/email");
const { signAccessToken, signRefreshToken } = require("../../../core/utils/authUtils");
const { createNotification } = require("../../notification/core/notification.service");
const { emitToUser } = require("../../../core/utils/_legacy/socket");
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

// exports.signup = catchAsync(async (req, res, next) => {
//   const { name, email, password, passwordConfirm, uniqueShopId } = req.body;
//   if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
//     return next(new AppError("All fields are required", 400));
//   if (password !== passwordConfirm)
//     return next(new AppError("Passwords do not match", 400));
//   const existingUser = await User.findOne({ email });
//   if (existingUser && existingUser.status !== "pending")
//     return next(new AppError("Email already in use", 400));
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
exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

  // 1. Validation
  if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
    return next(new AppError("All fields are required", 400));

  // 2. Tenant Lookup
  const organization = await Organization.findOne({ uniqueShopId }).populate("owner", "name email");
  if (!organization) return next(new AppError("Invalid Shop ID", 404));

  // 3. 🟢 SCOPED EMAIL CHECK (The Perfection Step)
  // Check if email exists ONLY in this specific organization
  const existingUser = await User.findOne({ email: email.toLowerCase(), organizationId: organization._id });
  if (existingUser && existingUser.status !== "pending")
    return next(new AppError("You are already registered in this organization.", 400));

  // 4. Create Pending User
  const newUser = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    passwordConfirm,
    organizationId: organization._id,
    status: "pending",
  });

  // 5. 📡 SIGNAL HANDLING (Your superior logic)
  if (organization.owner?._id) {
    const ownerId = organization.owner._id.toString();

    // Real-time Socket Signal
    emitToUser(ownerId, "newNotification", {
      title: "New Signup Request",
      message: `${newUser.name} has signed up.`,
      type: "info",
      createdAt: new Date().toISOString(),
    });

    // Persistent Notification Entry
    const io = req.app.get("io");
    await createNotification(
      organization._id,
      ownerId,
      "USER_SIGNUP",
      "New Employee Signup Request",
      `${name} (${email}) is waiting for approval.`,
      io,
    );

    // Email Alert (Non-blocking)
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

  if (!email || !password || !uniqueShopId)
    return next(new AppError("Email, password and Shop ID are required.", 400));

  const organization = await Organization.findOne({ uniqueShopId });
  if (!organization) return next(new AppError("Invalid Shop ID.", 404));

  const user = await User.findOne({ email: email.toLowerCase(), organizationId: organization._id })
    .select("+password")
    .populate({ path: "role", select: "name permissions isSuperAdmin isActive" });

  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError("Invalid credentials.", 401));

  if (user.status !== "approved")
    return next(new AppError("Account is not approved.", 401));

  // 🟢 SESSION CONCURRENCY FIX
  // Invalidate all old sessions for this user before creating a new one
  await Session.updateMany({ userId: user._id, isValid: true }, { isValid: false });

  // Ownership Check (Since we added isOwner to User model, this is just a backup)
  const isOwner = organization.owner.toString() === user._id.toString();

  const accessToken = signAccessToken({
    id: user._id,
    organizationId: user.organizationId,
    isOwner,
    isSuperAdmin: user.role?.isSuperAdmin || false
  });

  const { browser, os, device } = getDeviceInfo(req);
  const session = await Session.create({
    userId: user._id,
    token: accessToken,
    isValid: true,
    browser, os, deviceType: device,
    ipAddress: getClientIp(req),
    organizationId: user.organizationId,
  });

  res.status(200).json({
    status: "success",
    token: accessToken,
    data: { user, session }
  });
});

// exports.login = catchAsync(async (req, res, next) => {
//   const { email, password, uniqueShopId } = req.body;

//   // 1️⃣ Validate input
//   if (!email || !password || !uniqueShopId) {
//     return next(
//       new AppError("Email, password and Shop ID are required.", 400)
//     );
//   }

//   // 2️⃣ Find organization by uniqueShopId
//   const organization = await Organization.findOne({ uniqueShopId });
//   if (!organization) {
//     return next(new AppError("Invalid Shop ID.", 404));
//   }

//   // 3️⃣ Find user scoped to organization
//   const user = await User.findOne({
//     email,
//     organizationId: organization._id
//   })
//     .select("+password")
//     .populate({
//       path: "role",
//       select: "name permissions isSuperAdmin isActive"
//     });

//   // 4️⃣ Validate credentials
//   if (!user || !(await user.correctPassword(password, user.password))) {
//     return next(new AppError("Invalid credentials.", 401));
//   }

//   // 5️⃣ Approval check
//   if (user.status !== "approved") {
//     return next(new AppError("Account is not approved.", 401));
//   }

//   // 6️⃣ Check organization ownership
//   let isOwner = false;
//   try {
//     if (organization.owner) {
//       isOwner = organization.owner.toString() === user._id.toString();
//     }
//   } catch (err) {
//     console.error("Ownership check failed:", err);
//   }

//   // 7️⃣ Remove password
//   user.password = undefined;

//   // 8️⃣ Token payload
//   const userForToken = {
//     _id: user._id,
//     name: user.name,
//     email: user.email,
//     organizationId: user.organizationId,
//     branchId: user.branchId,
//     role: user.role,
//     isOwner,
//     isSuperAdmin: user.role?.isSuperAdmin || false
//   };

//   const accessToken = signAccessToken(userForToken);
//   const refreshToken = signRefreshToken(user._id);

//   // 9️⃣ Set refresh token cookie
//   res.cookie("refreshToken", refreshToken, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
//     maxAge: 30 * 24 * 60 * 60 * 1000
//   });

//   // 🔟 Create session
//   const { browser, os, device } = getDeviceInfo(req);
//   const ip = getClientIp(req);

//   const session = await Session.create({
//     userId: user._id,
//     token: accessToken,
//     isValid: true,
//     browser,
//     os,
//     deviceType: device,
//     ipAddress: ip,
//     organizationId: user.organizationId,
//     userAgent: req.headers["user-agent"] || null
//   });

//   // 1️⃣1️⃣ Response user object
//   const userResponse = {
//     ...user.toObject(),
//     isOwner,
//     isSuperAdmin: user.role?.isSuperAdmin || false,
//     permissions: user.role?.permissions || []
//   };

//   // 1️⃣2️⃣ Send response
//   res.status(200).json({
//     status: "success",
//     token: accessToken,
//     data: {
//       user: userResponse,
//       session
//     }
//   });
// });

exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) return next(new AppError("Not authenticated.", 401));

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 1. Ensure we have a valid ID from the token
  const userId = decoded.id || decoded._id || decoded.sub;
  if (!userId) return next(new AppError("Invalid token payload.", 401));

  // 2. Parallel Fetch for Speed
  const [user, session] = await Promise.all([
    User.findById(userId).populate({ 
      path: 'role', 
      select: 'name permissions isSuperAdmin isActive' 
    }),
    Session.findOne({ userId, token, isValid: true })
  ]);

  // 3. Validation Checks
  if (!user) return next(new AppError("User no longer exists.", 401));
  if (!user.isActive) return next(new AppError("User account is deactivated.", 401));
  if (!session) return next(new AppError("Session revoked or expired. Please login again.", 401));

  // 4. Password Change Check (Security Perfection)
  if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat)) {
    return next(new AppError("Password was recently changed. Please login again.", 401));
  }

  // 5. 🟢 THE PERFECTION FIX: Flattening for Permission Middleware
  // We convert to a plain object and lift role properties to the top level
  const userObj = user.toObject();
  
  req.user = {
    ...userObj,
    // Prioritize the role's superadmin status and permissions
    isSuperAdmin: user.role?.isSuperAdmin || user.isSuperAdmin || false,
    permissions: user.role?.permissions || [],
    roleName: user.role?.name || 'No Role'
  };

  req.session = session;

  // 6. Fire-and-forget last activity update (Performance optimized)
  Session.findByIdAndUpdate(session._id, { lastActivityAt: new Date() }).exec();

  next();
});

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

//   // Get user with populated role
//   const user = await User.findById(decoded.id)
//     .populate({
//       path: 'role',
//       select: 'name permissions isSuperAdmin isActive'
//     });

//   if (!user) return next(new AppError("User no longer exists.", 401));

//   if (user.changedPasswordAfter(decoded.iat))
//     return next(new AppError("Password changed recently.", 401));

//   const session = await Session.findOne({
//     userId: user._id,
//     isValid: true,
//   });

//   if (!session) return next(new AppError("Session revoked. Login again.", 401));

//   session.lastActivityAt = new Date();
//   await session.save();

//   // 🔴 CRITICAL FIX: Re-check organization ownership on each request
//   // The isOwner flag from JWT might be outdated if organization ownership changed
//   let currentIsOwner = false;
//   try {
//     const organization = await Organization.findById(user.organizationId);
//     if (organization) {
//       currentIsOwner = organization.owner.toString() === user._id.toString();
//     }
//   } catch (error) {
//     console.error("Error checking organization ownership in protect:", error);
//     // Fallback to JWT value if check fails
//     currentIsOwner = decoded.isOwner || false;
//   }

//   // Build the user object for the request
//   req.user = {
//     // Basic user info
//     _id: user._id,
//     name: user.name,
//     email: user.email,
//     organizationId: user.organizationId,
//     branchId: user.branchId,
//     status: user.status,
//     isActive: user.isActive,

//     // Role info
//     role: user.role,

//     // Special privilege flags - use current check, not just JWT
//     isOwner: currentIsOwner, // Use freshly checked value
//     isSuperAdmin: user.role?.isSuperAdmin || decoded.isSuperAdmin || false,

//     // Permissions from role
//     permissions: user.role?.permissions || [],

//     // Profile data
//     avatar: user.avatar,
//     preferences: user.preferences,
//     attendanceConfig: user.attendanceConfig,
//   };

//   req.session = session;

//   // Debug logging
//   if (process.env.NODE_ENV === "development") {
//     console.log("🔐 User authenticated:", {
//       userId: req.user._id,
//       email: req.user.email,
//       role: req.user.role?.name,
//       isOwner: req.user.isOwner,
//       isSuperAdmin: req.user.isSuperAdmin,
//       permissionsCount: req.user.permissions.length,
//       fromJWT: {
//         isOwner: decoded.isOwner,
//         isSuperAdmin: decoded.isSuperAdmin
//       },
//       fromDB: {
//         isOwner: currentIsOwner,
//         isSuperAdmin: user.role?.isSuperAdmin
//       }
//     });
//   }

//   next();
// });

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

const createSendToken = async (user, statusCode, res) => {
  // 1. Populate role if not already populated (to get permissions)
  if (!user.role || !user.role.permissions) {
    await user.populate('role');
  }

  const token = signToken(user._id, user.email, user.organizationId, user.role._id);

  // 2. Cookie options
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

  res.cookie('jwt', token, cookieOptions);

  // 3. Remove sensitive data
  user.password = undefined;

  // 4. FLATTEN PERMISSIONS: Create a clean list for the frontend
  // This allows the UI to check user.permissions.includes('PERM') directly
  let permissions = [];
  if (user.role && user.role.permissions) {
    permissions = user.role.permissions;
  }

  // Create a clean user object for response
  const userResponse = user.toObject();
  userResponse.permissions = permissions; // Inject permissions array

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: userResponse,
    },
  });
};

// ======================================================
//  REFRESH TOKEN
// ======================================================

// 👇 FIX 2: Update refreshToken to pass full user object
// exports.refreshToken = catchAsync(async (req, res, next) => {
//   const refreshToken = req.cookies.refreshToken;
//   if (!refreshToken) return next(new AppError("No refresh token provided", 401));

//   let decoded;
//   try {
//     decoded = await promisify(jwt.verify)(refreshToken, process.env.REFRESH_TOKEN_SECRET);
//   } catch (err) {
//     return next(new AppError("Invalid refresh token", 401));
//   }

//   const user = await User.findById(decoded.id);
//   if (!user) return next(new AppError("User does not exist anymore", 401));

//   const sessionExists = await Session.findOne({ userId: user._id, isValid: true });
//   if (!sessionExists) {
//     res.cookie("refreshToken", "", { httpOnly: true, expires: new Date(0) });
//     return next(new AppError("Session expired. Please login again.", 401));
//   }
//   const newAccessToken = signAccessToken(user);
//   sessionExists.lastActivityAt = new Date();
//   await sessionExists.save();

//   res.status(200).json({ status: "success", token: newAccessToken });
// });
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

  // Check organization ownership for refresh
  let isOwner = false;
  try {
    const organization = await Organization.findById(user.organizationId);
    if (organization) {
      isOwner = organization.owner.toString() === user._id.toString();
    }
  } catch (error) {
    console.error("Error checking ownership during refresh:", error);
  }

  const userForToken = {
    _id: user._id,
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
    isOwner: isOwner,
    isSuperAdmin: user.role?.isSuperAdmin || false
  };

  const newAccessToken = signAccessToken(userForToken);

  sessionExists.lastActivityAt = new Date();
  sessionExists.token = newAccessToken; // Update token in session
  await sessionExists.save();

  res.status(200).json({
    status: "success",
    token: newAccessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      isOwner: isOwner,
      isSuperAdmin: user.role?.isSuperAdmin,
      role: user.role?.name
    }
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
