const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/userModel");
const Organization = require("../models/organizationModel");
const Role = require("../models/roleModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { signToken } = require("../utils/authUtils");
const sendEmail = require("../utils/email");
const { createNotification } = require("../services/notificationService");

// ======================================================
// 🧩 HELPER: Create and Send JWT
// ======================================================
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user);
  user.password = undefined;
  res.status(statusCode).json({
    status: "success",
    token,
    data: { user },
  });
};

// ======================================================
// 🧩 SIGNUP (Employee)
// ======================================================
exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

  if (!name || !email || !password || !passwordConfirm || !uniqueShopId)
    return next(new AppError("All fields are required", 400));

  if (password !== passwordConfirm)
    return next(new AppError("Passwords do not match", 400));

  // Check for existing user with same email
  const existingUser = await User.findOne({ email });
  if (existingUser && existingUser.status !== "pending") {
    return next(new AppError("Email already in use. Please login instead.", 400));
  }

  // Find the organization
  const organization = await Organization.findOne({ uniqueShopId }).populate(
    "owner",
    "name email"
  );
  if (!organization)
    return next(new AppError("Invalid Shop ID — organization not found.", 404));

  // Create pending user
  const newUser = await User.create({
    name,
    email,
    password,
    passwordConfirm,
    organizationId: organization._id,
    status: "pending",
  });

  // Add to approval queue
  organization.approvalRequests.push(newUser._id);
  await organization.save();

  // ✅ Emit live notification to owner
  const io = req.app.get("io");
  if (io && organization.owner?._id) {
    io.to(organization.owner._id.toString()).emit("newNotification", {
      title: "New Signup Request",
      message: `${newUser.name} has signed up and is waiting for approval.`,
      createdAt: new Date().toISOString(),
    });
    console.log(`📡 Notification emitted to ${organization.owner._id}`);
  }

  // ✅ Create persistent notification
  await createNotification(
    organization._id,
    organization.owner._id,
    "USER_SIGNUP",
    "New Employee Signup Request",
    `${name} (${email}) has requested to join your organization.`,
    io
  );

  // ✅ Optional email alert
  if (organization.owner?.email) {
    try {
      await sendEmail({
        email: organization.owner.email,
        subject: "New Employee Signup Request",
        message: `Hello ${organization.owner.name},

${name} (${email}) has requested to join your organization (${organization.name}).
Please review and approve them in your dashboard.

– Shivam Electronics CRM`,
        section
      });
    } catch (err) {
      console.warn("⚠️ Failed to send signup notification email:", err.message);
    }
  }

  res.status(201).json({
    status: "success",
    message: "Signup successful! Your account is pending approval from the admin.",
  });
});

// ======================================================
// 🧩 LOGIN
// ======================================================
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password)
    return next(new AppError("Please provide email and password!", 400));

  const user = await User.findOne({ email }).select("+password").populate("role");

  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError("Incorrect email or password", 401));

  if (user.status === "pending")
    return next(new AppError("Your account is still pending approval.", 401));

  if (user.status !== "approved")
    return next(new AppError("This user account is inactive.", 401));

  createSendToken(user, 200, res);
});

// ======================================================
// 🧩 PROTECT (JWT Middleware)
// ======================================================
exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer"))
    token = req.headers.authorization.split(" ")[1];

  if (!token)
    return next(new AppError("You are not logged in! Please log in.", 401));

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  const currentUser = await User.findById(decoded.id).populate("role");
  if (!currentUser)
    return next(new AppError("The user belonging to this token no longer exists.", 401));

  if (currentUser.changedPasswordAfter(decoded.iat))
    return next(new AppError("User recently changed password! Please log in again.", 401));

  if (currentUser.status !== "approved")
    return next(new AppError("This user account is not active.", 401));

  req.user = currentUser;
  req.user.permissions = currentUser.role?.permissions || [];
  next();
});

// ======================================================
// 🧩 RESTRICT TO
// ======================================================
exports.restrictTo = (...permissions) => {
  return (req, res, next) => {
    if (!req.user)
      return next(new AppError("You are not authorized.", 403));

    const { role, permissions: userPermissions } = req.user;

    if (permissions.includes("superadmin") && role?.isSuperAdmin)
      return next();

    const hasPermission = permissions.some((p) => userPermissions.includes(p));
    if (!hasPermission)
      return next(new AppError("You do not have permission to perform this action.", 403));

    next();
  };
};

// ======================================================
// 🧩 FORGOT PASSWORD
// ======================================================
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user)
    return next(new AppError("There is no user with that email address.", 404));

  // Generate reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetURL = `${process.env.FRONTEND_URL}/auth/reset-password/${resetToken}`;
  const message = `Forgot your password? Reset it here: ${resetURL}\nIf you didn't request this, ignore this email.`;

  try {
    await sendEmail({
      email: user.email,
      subject: "Your password reset link (valid for 10 minutes)",
      message,
    });

    res.status(200).json({
      status: "success",
      message: "Password reset link sent to your email.",
      CSS
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError("Error sending email. Try again later.", 500));
  }
});

// ======================================================
// 🧩 RESET PASSWORD
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

  if (!user)
    return next(new AppError("Token is invalid or expired.", 400))
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  createSendToken(user, 200, res);
});

// ======================================================
// 🧩 UPDATE PASSWORD (LOGGED-IN USER)
// ======================================================
exports.updateMyPassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("+password");

  if (!(await user.correctPassword(req.body.currentPassword, user.password)))
    return next(new AppError("Your current password is incorrect.", 401));

  user.password = req.body.newPassword;
  user.passwordConfirm = req.body.newPasswordConfirm;
  await user.save();

  createSendToken(user, 200, res);
});

// const { promisify } = require("util");
// const jwt = require("jsonwebtoken");
// const crypto = require("crypto");
// const User = require("../models/userModel");
// const Organization = require("../models/organizationModel");
// const Role = require("../models/roleModel");
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const { signToken } = require("../utils/authUtils");
// const sendEmail = require("../utils/email");
// const { createNotification } = require("../services/notificationService");

// // ======================================================
// // 🧩 HELPER: Create and Send JWT
// // ======================================================
// const createSendToken = (user, statusCode, res) => {
//   const token = signToken(user);
//   user.password = undefined;

//   res.status(statusCode).json({
//     status: "success",
//     token,
//     data: { user },
//   });
// };

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
//   organization.approvalRequests.push(newUser._id);
//   await organization.save();

//   // ✅ Emit live notification to owner
//   const io = req.app.get("io");
//   if (io && organization.owner?._id) {
//     io.to(organization.owner._id.toString()).emit("newNotification", {
//       title: "New Signup Request",
//       message: `${newUser.name} has signed up and is waiting for approval.`,
//       createdAt: new Date().toISOString(),
//     });
//     console.log(`📡 Notification emitted to ${organization.owner._id}`);
//   }

//   // ✅ Create persistent notification
//   await createNotification(
//     organization._id,
//     organization.owner._id,
//     "USER_SIGNUP",
//     "New Employee Signup Request",
//     `${name} (${email}) has requested to join your organization.`,
//     io
//   );

//   // ✅ Optional email alert
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
//     return next(new AppError("Please provide email and password!", 400));

//   const user = await User.findOne({ email }).select("+password").populate("role");

//   if (!user || !(await user.correctPassword(password, user.password)))
//     return next(new AppError("Incorrect email or password", 401));

//   if (user.status === "pending")
//     return next(new AppError("Your account is still pending approval.", 401));

//   if (user.status !== "approved")
//     return next(new AppError("This user account is inactive.", 401));

//   createSendToken(user, 200, res);
// });

// // ======================================================
// // 🧩 PROTECT (JWT Middleware)
// // ======================================================
// exports.protect = catchAsync(async (req, res, next) => {
//   let token;
//   if (req.headers.authorization?.startsWith("Bearer"))
//     token = req.headers.authorization.split(" ")[1];

//   if (!token)
//     return next(new AppError("You are not logged in! Please log in.", 401));

//   const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

//   const currentUser = await User.findById(decoded.id).populate("role");
//   if (!currentUser)
//     return next(new AppError("The user belonging to this token no longer exists.", 401));

//   if (currentUser.changedPasswordAfter(decoded.iat))
//     return next(new AppError("User recently changed password! Please log in again.", 401));

//   if (currentUser.status !== "approved")
//     return next(new AppError("This user account is not active.", 401));

//   req.user = currentUser;
//   req.user.permissions = currentUser.role?.permissions || [];
//   next();
// });

// // ======================================================
// // 🧩 RESTRICT TO
// // ======================================================

// exports.restrictTo = (...permissions) => {
//   return (req, res, next) => {
//     if (!req.user)
//       return next(new AppError("You are not authorized.", 403));

//     const { role, permissions: userPermissions } = req.user;

//     if (permissions.includes("superadmin") && role?.isSuperAdmin)
//       return next();

//     const hasPermission = permissions.some((p) => userPermissions.includes(p));
//     if (!hasPermission)
//       return next(new AppError("You do not have permission to perform this action.", 403));

//     next();
//   };
// };

// // ======================================================
// // 🧩 FORGOT PASSWORD
// // ======================================================

// exports.forgotPassword = catchAsync(async (req, res, next) => {
//   const { email } = req.body;

//   const user = await User.findOne({ email });
//   if (!user)
//     return next(new AppError("There is no user with that email address.", 404));

//   // Generate reset token
//   const resetToken = user.createPasswordResetToken();
//   await user.save({ validateBeforeSave: false });

//   const resetURL = `${process.env.FRONTEND_URL}/auth/reset-password/${resetToken}`;
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
//   const hashedToken = crypto
//     .createHash("sha256")
//     .update(req.params.token)
//     .digest("hex");

//   const user = await User.findOne({
//     passwordResetToken: hashedToken,
//     passwordResetExpires: { $gt: Date.now() },
//   });

//   if (!user)
//     return next(new AppError("Token is invalid or expired.", 400));

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

//   if (!(await user.correctPassword(req.body.currentPassword, user.password)))
//     return next(new AppError("Your current password is incorrect.", 401));

//   user.password = req.body.newPassword;
//   user.passwordConfirm = req.body.newPasswordConfirm;
//   await user.save();

//   createSendToken(user, 200, res);
// });
