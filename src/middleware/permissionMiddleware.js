// middleware/permissionMiddleware.js
const {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} = require("../config/permissions");

// Single permission check
const checkPermission = (permission) => {
  return (req, res, next) => {
    try {
      // Get user's permissions from token/DB
      const userPermissions = req.user?.permissions || [];

      if (!hasPermission(userPermissions, permission)) {
        return res.status(403).json({
          status: "error",
          message: "You do not have permission to perform this action",
        });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        status: "error",
        message: "Permission validation failed",
      });
    }
  };
};

// Multiple permissions (any)
const checkAnyPermission = (permissions) => {
  return (req, res, next) => {
    try {
      const userPermissions = req.user?.permissions || [];

      if (!hasAnyPermission(userPermissions, permissions)) {
        return res.status(403).json({
          status: "error",
          message: "You do not have required permissions",
        });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        status: "error",
        message: "Permission validation failed",
      });
    }
  };
};

// Multiple permissions (all)
const checkAllPermissions = (permissions) => {
  return (req, res, next) => {
    try {
      const userPermissions = req.user?.permissions || [];

      if (!hasAllPermissions(userPermissions, permissions)) {
        return res.status(403).json({
          status: "error",
          message: "You do not have all required permissions",
        });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        status: "error",
        message: "Permission validation failed",
      });
    }
  };
};

// Role-based permission check
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      const userRole = req.user?.role?.name || req.user?.role;

      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({
          status: "error",
          message: "Access restricted to specific roles",
        });
      }

      next();
    } catch (error) {
      console.error("Role check error:", error);
      return res.status(500).json({
        status: "error",
        message: "Role validation failed",
      });
    }
  };
};

module.exports = {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  checkRole,
};
// const AppError = require('../utils/appError');
// const Role = require('../models/roleModel'); // Ensure path is correct

// exports.checkPermission = (requiredPermission) => {
//   return async (req, res, next) => {
//     // 1. Check if Auth Middleware ran
//     if (!req.user) {
//       return next(new AppError('Not authenticated. Please login.', 401));
//     }

//     // 2. Load Role (if not already loaded by protect middleware)
//     // Optimization: Assuming req.user.role is an ObjectId, we might need to fetch it
//     let role = req.user.roleDetails; // Suppose protect() populates this

//     if (!role && req.user.role) {
//        role = await Role.findById(req.user.role);
//     }

//     if (!role) {
//       return next(new AppError('Role not found for this user.', 403));
//     }

//     // 3. SUPER ADMIN BYPASS
//     if (role.isSuperAdmin) {
//       return next();
//     }

//     // 4. Check Tag
//     if (!role.permissions.includes(requiredPermission)) {
//       return next(new AppError(`Access Denied. Required permission: ${requiredPermission}`, 403));
//     }

//     next();
//   };
// };
