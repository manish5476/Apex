// middleware/permissionMiddleware.js
const {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} = require("../config/permissions");

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

      const userPermissions = req.user.permissions || [];

      if (!hasPermission(userPermissions, requiredPermission)) {
        return res.status(403).json({
          status: "error",
          message: `You don't have permission to: ${requiredPermission}`,
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

// Check if user is organization owner (alternative to authMiddleware.restrictToOwner)
const checkIsOwner = () => {
  return (req, res, next) => {
    if (!req.user.isOwner) {
      return res.status(403).json({
        status: "error",
        message: "Only organization owner can perform this action",
      });
    }
    next();
  };
};

// Check if user is super admin (alternative to authMiddleware.restrictToSuperAdmin)
const checkIsSuperAdmin = () => {
  return (req, res, next) => {
    if (!req.user.isOwner && !req.user.isSuperAdmin) {
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
};
