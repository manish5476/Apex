const jwt = require("jsonwebtoken");
const User = require("../../modules/auth/core/user.model");
const Organization = require("../../modules/organization/core/organization.model");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

exports.protect = async (req, res, next) => {
  try {
    // 1. Extract token
    const token =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : req.cookies?.jwt;

    if (!token) {
      return res.status(401).json({ status: "fail", message: "You are not logged in" });
    }

    // 2. Verify token
    const decoded = await new Promise((resolve, reject) =>
      jwt.verify(token, JWT_SECRET, (err, payload) =>
        err ? reject(err) : resolve(payload)
      )
    );

    // 3. ✅ Parallel DB hit — User + Org in one round-trip instead of two sequential
    const [currentUser, ownerOrg] = await Promise.all([
      User.findById(decoded.id).populate({
        path: "role",
        select: "permissions name isSuperAdmin",
      }),
      Organization.findOne({ owner: decoded.id }).select("_id").lean(),
    ]);

    if (!currentUser) {
      return res.status(401).json({ status: "fail", message: "User no longer exists" });
    }

    if (currentUser.changedPasswordAfter?.(decoded.iat)) {
      return res.status(401).json({
        status: "fail",
        message: "Password recently changed. Please log in again",
      });
    }

    const isOwner = !!ownerOrg;

    // 4. Attach resolved identity — ONE place, ONE time
    //    Everything downstream reads from req.user; no more DB calls for authz.
    req.user = {
      _id: currentUser._id,
      id: currentUser._id,
      email: currentUser.email,
      name: currentUser.name,
      organizationId: currentUser.organizationId,
      branchId: currentUser.branchId,
      role: currentUser.role?._id,
      roleName: currentUser.role?.name,
      isOwner,
      // isOwner gets wildcard; isSuperAdmin inherits from role
      isSuperAdmin: isOwner || currentUser.role?.isSuperAdmin || false,
      // isOwner → ["*"] (all access), otherwise role permissions array
      permissions: isOwner ? ["*"] : (currentUser.role?.permissions ?? []),
    };

    req.userDoc = currentUser; // raw doc for controllers that need it

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ status: "fail", message: "jwt expired", code: "TOKEN_EXPIRED" });
    }
    console.error("Auth error:", err.message);
    return res.status(401).json({ status: "fail", message: "Invalid token" });
  }
};

// Convenience guards — use in routes when you only need ownership/admin, not a specific permission
exports.restrictToOwner = (req, res, next) => {
  if (!req.user.isOwner) {
    return res.status(403).json({ status: "error", message: "Only organization owners can do this" });
  }
  next();
};

exports.restrictToSuperAdmin = (req, res, next) => {
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    return res.status(403).json({ status: "error", message: "Only super administrators can do this" });
  }
  next();
};


// // middleware/authMiddleware.js
// const jwt = require("jsonwebtoken");
// const User = require("../../modules/auth/core/user.model");
// const Organization = require("../../modules/organization/core/organization.model");
// const catchAsync = require("../utils/api/catchAsync");

// const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

// exports.protect = async (req, res, next) => {
//   try {
//     // 1) Get token from header or cookie
//     let token;
//     if (
//       req.headers.authorization &&
//       req.headers.authorization.startsWith("Bearer")
//     ) {
//       token = req.headers.authorization.split(" ")[1];
//     } else if (req.cookies && req.cookies.jwt) {
//       token = req.cookies.jwt;
//     }

//     // 2) If no token found, return 401
//     if (!token) {
//       return res.status(401).json({
//         status: "fail",
//         message: "You are not logged in",
//       });
//     }

//     // 3) Verify Token with promise wrapper
//     const decoded = await new Promise((resolve, reject) => {
//       jwt.verify(token, JWT_SECRET, (err, payload) => {
//         if (err) return reject(err);
//         resolve(payload);
//       });
//     });

//     // 4) Check if User still exists WITH populated role
//     const currentUser = await User.findById(decoded.id).populate({
//       path: "role",
//       select: "permissions name isSuperAdmin",
//     });

//     if (!currentUser) {
//       return res.status(401).json({
//         status: "fail",
//         message: "User no longer exists",
//       });
//     }

//     // 5) Check if user changed password after token was issued
//     if (
//       currentUser.changedPasswordAfter &&
//       currentUser.changedPasswordAfter(decoded.iat)
//     ) {
//       return res.status(401).json({
//         status: "error",
//         message: "User recently changed password. Please log in again",
//       });
//     }

//     // 6) Check if user is organization owner
//     let isOwner = false;
//     if (currentUser.organizationId) {
//       const org = await Organization.findOne({
//         _id: currentUser.organizationId,
//         owner: currentUser._id,
//       });
//       isOwner = !!org;
//     }

//     // 7) Attach user info to the request object with permissions
//     req.user = {
//       _id: currentUser._id,
//       id: currentUser._id,
//       email: currentUser.email,
//       name: currentUser.name,
//       organizationId: currentUser.organizationId,
//       branchId: currentUser.branchId,
//       role: currentUser.role?._id,
//       roleName: currentUser.role?.name,
//       // Add permissions from role (owner gets wildcard)
//       permissions: isOwner ? ["*"] : currentUser.role?.permissions || [],
//       isOwner: isOwner,
//       isSuperAdmin: isOwner ? true : currentUser.role?.isSuperAdmin || false,
//     };

//     // 8) Also attach the full user document for any controllers that need it
//     req.userDoc = currentUser;

//     next();
//   } catch (err) {
//     console.error("Auth Error:", err.message);

//     // SPECIFIC ERROR HANDLING FOR EXPIRATION
//     if (err.name === "TokenExpiredError") {
//       return res.status(401).json({
//         status: "fail",
//         message: "jwt expired",
//         code: "TOKEN_EXPIRED",
//       });
//     }

//     // GENERIC ERROR HANDLING
//     return res.status(401).json({
//       status: "fail",
//       message: "Invalid token",
//     });
//   }
// };

// // Middleware to check if user is owner
// exports.restrictToOwner = (req, res, next) => {
//   if (!req.user.isOwner) {
//     return res.status(403).json({
//       status: "error",
//       message: "Only organization owners can perform this action",
//     });
//   }
//   next();
// };

// // Middleware to check if user is super admin (owner or has super admin role)
// exports.restrictToSuperAdmin = (req, res, next) => {
//   if (!req.user.isOwner && !req.user.isSuperAdmin) {
//     return res.status(403).json({
//       status: "error",
//       message: "Only super administrators can perform this action",
//     });
//   }
//   next();
// };

// exports.verifyOrgAccess = catchAsync(async (req, res, next) => {
//   if (req.user.organizationId.toString() !== req.params.orgId?.toString()) {
//     return next(new AppError('Access denied', 403));
//   }
//   next();
// });