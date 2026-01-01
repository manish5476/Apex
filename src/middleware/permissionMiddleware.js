// middleware/permissionMiddleware.js
const {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} = require("../config/permissions");

const hasSpecialPrivileges = (user) => {
  return user && (user.isOwner === true || user.isSuperAdmin === true);
};

// Single permission check
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      // 🔥 CRITICAL FIX: Check for special privileges FIRST
      if (hasSpecialPrivileges(req.user)) {
        return next(); // Owners and Super Admins get full access
      }

      const userPermissions = req.user.permissions || [];

      if (!hasPermission(userPermissions, requiredPermission)) {
        return res.status(403).json({
          status: "error",
          message: `You don't have permission to: ${requiredPermission}`,
          debug: {
            userId: req.user._id,
            email: req.user.email,
            isOwner: req.user.isOwner,
            isSuperAdmin: req.user.isSuperAdmin,
            roleName: req.user.role?.name,
            permissions: userPermissions
          }
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
const checkAnyPermission = (requiredPermissions) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      // Check for special privileges
      if (hasSpecialPrivileges(req.user)) {
        return next();
      }

      const userPermissions = req.user.permissions || [];

      if (!hasAnyPermission(userPermissions, requiredPermissions)) {
        return res.status(403).json({
          status: "error",
          message: "Insufficient permissions",
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
const checkAllPermissions = (requiredPermissions) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      // Check for special privileges
      if (hasSpecialPrivileges(req.user)) {
        return next();
      }

      const userPermissions = req.user.permissions || [];

      if (!hasAllPermissions(userPermissions, requiredPermissions)) {
        return res.status(403).json({
          status: "error",
          message: "Missing required permissions",
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

// Check if user is organization owner
const checkIsOwner = () => {
  return (req, res, next) => {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    if (!req.user.isOwner && !req.user.isSuperAdmin) {
      return res.status(403).json({
        status: "error",
        message: "Only organization owner can perform this action",
      });
    }
    next();
  };
};

// Check if user is super admin
const checkIsSuperAdmin = () => {
  return (req, res, next) => {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    if (!req.user.isSuperAdmin) {
      return res.status(403).json({
        status: "error",
        message: "Only super administrators can perform this action",
      });
    }
    next();
  };
};

module.exports = {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  checkIsOwner,
  checkIsSuperAdmin,
  hasSpecialPrivileges,
};
