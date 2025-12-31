// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const Organization = require("../models/organizationModel");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

exports.protect = async (req, res, next) => {
  try {
    // 1) Get token from header or cookie
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    // 2) If no token found, return 401
    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "You are not logged in",
      });
    }

    // 3) Verify Token with promise wrapper
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return reject(err);
        resolve(payload);
      });
    });

    // 4) Check if User still exists WITH populated role
    const currentUser = await User.findById(decoded.id).populate({
      path: "role",
      select: "permissions name isSuperAdmin",
    });

    if (!currentUser) {
      return res.status(401).json({
        status: "fail",
        message: "User no longer exists",
      });
    }

    // 5) Check if user changed password after token was issued
    if (
      currentUser.changedPasswordAfter &&
      currentUser.changedPasswordAfter(decoded.iat)
    ) {
      return res.status(401).json({
        status: "error",
        message: "User recently changed password. Please log in again",
      });
    }

    // 6) Check if user is organization owner
    let isOwner = false;
    if (currentUser.organizationId) {
      const org = await Organization.findOne({
        _id: currentUser.organizationId,
        owner: currentUser._id,
      });
      isOwner = !!org;
    }

    // 7) Attach user info to the request object with permissions
    req.user = {
      _id: currentUser._id,
      id: currentUser._id,
      email: currentUser.email,
      name: currentUser.name,
      organizationId: currentUser.organizationId,
      branchId: currentUser.branchId,
      role: currentUser.role?._id,
      roleName: currentUser.role?.name,
      // Add permissions from role (owner gets wildcard)
      permissions: isOwner ? ["*"] : currentUser.role?.permissions || [],
      isOwner: isOwner,
      isSuperAdmin: isOwner ? true : currentUser.role?.isSuperAdmin || false,
    };

    // 8) Also attach the full user document for any controllers that need it
    req.userDoc = currentUser;

    next();
  } catch (err) {
    console.error("Auth Error:", err.message);

    // SPECIFIC ERROR HANDLING FOR EXPIRATION
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        status: "fail",
        message: "jwt expired",
        code: "TOKEN_EXPIRED",
      });
    }

    // GENERIC ERROR HANDLING
    return res.status(401).json({
      status: "fail",
      message: "Invalid token",
    });
  }
};

// Middleware to check if user is owner
exports.restrictToOwner = (req, res, next) => {
  if (!req.user.isOwner) {
    return res.status(403).json({
      status: "error",
      message: "Only organization owners can perform this action",
    });
  }
  next();
};

// Middleware to check if user is super admin (owner or has super admin role)
exports.restrictToSuperAdmin = (req, res, next) => {
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    return res.status(403).json({
      status: "error",
      message: "Only super administrators can perform this action",
    });
  }
  next();
};

// // middleware/authMiddleware.js
// const User = require('../models/userModel');
// const Organization = require('../models/organizationModel');
// const jwt = require('jsonwebtoken');

// exports.protect = async (req, res, next) => {
//   try {
//     // 1) Get token from header
//     let token;
//     if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
//       token = req.headers.authorization.split(' ')[1];
//     }

//     if (!token) {
//       return res.status(401).json({
//         status: 'error',
//         message: 'You are not logged in'
//       });
//     }

//     // 2) Verify token
//     const decoded = await jwt.verify(token, process.env.JWT_SECRET);

//     // 3) Get user WITH populated role
//     const user = await User.findById(decoded.id)
//       .populate({
//         path: 'role',
//         select: 'permissions name isSuperAdmin'
//       });

//     if (!user) {
//       return res.status(401).json({
//         status: 'error',
//         message: 'User no longer exists'
//       });
//     }

//     // 4) Check if user changed password after token was issued
//     if (user.changedPasswordAfter(decoded.iat)) {
//       return res.status(401).json({
//         status: 'error',
//         message: 'User recently changed password. Please log in again'
//       });
//     }

//     // 5) Check if user is organization owner
//     let isOwner = false;
//     if (user.organizationId) {
//       const org = await Organization.findOne({
//         _id: user.organizationId,
//         owner: user._id
//       });
//       isOwner = !!org;
//     }

//     // 6) Attach user to request with all necessary info
//     req.user = user;
//     req.user.permissions = isOwner ? ['*'] : (user.role?.permissions || []);
//     req.user.isOwner = isOwner;
//     req.user.isSuperAdmin = isOwner ? true : (user.role?.isSuperAdmin || false);
//     req.user.roleName = user.role?.name;

//     next();

//   } catch (error) {
//     return res.status(401).json({
//       status: 'error',
//       message: 'Authentication failed'
//     });
//   }
// };

// // // src/middleware/authMiddleware.js
// // const jwt = require('jsonwebtoken');
// // // Ensure this path matches your actual file structure (check uppercase/lowercase!)
// // const User = require('../models/userModel');

// // const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// // exports.protect = async (req, res, next) => {
// //   try {
// //     let token;
// //     if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
// //       token = req.headers.authorization.split(' ')[1];
// //     } else if (req.cookies && req.cookies.jwt) {
// //       token = req.cookies.jwt;
// //     }

// //     // 2. If no token found, return 401
// //     if (!token) {
// //       return res.status(401).json({
// //         status: 'fail',
// //         message: 'You are not logged in'
// //       });
// //     }

// //     // 3. Verify Token
// //     const decoded = await new Promise((resolve, reject) => {
// //       jwt.verify(token, JWT_SECRET, (err, payload) => {
// //         if (err) return reject(err); // This will jump to the catch block
// //         resolve(payload);
// //       });
// //     });

// //     // 4. Check if User still exists
// //     const currentUser = await User.findById(decoded.id).select('+password');
// //     if (!currentUser) {
// //       return res.status(401).json({
// //         status: 'fail',
// //         message: 'User no longer exists'
// //       });
// //     }

// //     // 5. Grant Access
// //     // Attach user info to the request object for the next controller
// //     req.user = {
// //       id: currentUser._id,
// //       email: currentUser.email,
// //       role: currentUser.role || 'user'
// //     };

// //     next();

// //   } catch (err) {
// //     console.error("Auth Error:", err.message);

// //     // SPECIFIC ERROR HANDLING FOR EXPIRATION
// //     if (err.name === 'TokenExpiredError') {
// //       return res.status(401).json({
// //         status: 'fail',
// //         message: 'jwt expired', // Frontend looks for this specific string
// //         code: 'TOKEN_EXPIRED'   // Optional: specific code for frontend logic
// //       });
// //     }

// //     // GENERIC ERROR HANDLING
// //     return res.status(401).json({
// //       status: 'fail',
// //       message: 'Invalid token'
// //     });
// //   }
// // };
