const { hasPermission, hasAnyPermission, hasAllPermissions } = require("../../config/permissions");

// ── Internal helpers ──────────────────────────────────────

const notAuthenticated = (res) =>
  res.status(401).json({ status: "error", message: "Authentication required" });

const notAuthorized = (res, message = "Insufficient permissions") =>
  res.status(403).json({ status: "error", message });

const hasSpecialPrivileges = (user) =>
  user?.isOwner === true || user?.isSuperAdmin === true;

// ── Exported middleware factories ─────────────────────────

/**
 * Require ONE specific permission tag.
 *
 * Usage:  checkPermission(PERMISSIONS.LEAVE.APPROVE)
 */
const checkPermission = (required) => (req, res, next) => {
  if (!req.user?._id) return notAuthenticated(res);
  if (hasSpecialPrivileges(req.user)) return next();
  if (!hasPermission(req.user.permissions, required)) {
    return notAuthorized(res, `You don't have permission to: ${required}`);
  }
  next();
};

/**
 * Require AT LEAST ONE of the listed permission tags.
 *
 * Usage:  checkAnyPermission([PERMISSIONS.LEAVE.APPROVE, PERMISSIONS.LEAVE.ADMIN])
 */
const checkAnyPermission = (required) => (req, res, next) => {
  if (!req.user?._id) return notAuthenticated(res);
  if (hasSpecialPrivileges(req.user)) return next();
  if (!hasAnyPermission(req.user.permissions, required)) return notAuthorized(res);
  next();
};

/**
 * Require ALL of the listed permission tags.
 *
 * Usage:  checkAllPermissions([PERMISSIONS.LEAVE.APPROVE, PERMISSIONS.LEAVE.ADMIN])
 */
const checkAllPermissions = (required) => (req, res, next) => {
  if (!req.user?._id) return notAuthenticated(res);
  if (hasSpecialPrivileges(req.user)) return next();
  if (!hasAllPermissions(req.user.permissions, required)) {
    return notAuthorized(res, "Missing required permissions");
  }
  next();
};

/**
 * Restrict to organization owners only.
 * Use this instead of a permission tag when the action is owner-exclusive.
 */
const checkIsOwner = () => (req, res, next) => {
  if (!req.user?._id) return notAuthenticated(res);
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    return notAuthorized(res, "Only organization owners can perform this action");
  }
  next();
};

/**
 * Restrict to super admins only.
 */
const checkIsSuperAdmin = () => (req, res, next) => {
  if (!req.user?._id) return notAuthenticated(res);
  if (!req.user.isSuperAdmin) {
    return notAuthorized(res, "Only super administrators can perform this action");
  }
  next();
};

module.exports = {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  checkIsOwner,
  checkIsSuperAdmin,
  hasSpecialPrivileges,
};




// // middleware/permissionMiddleware.js
// const {
//   hasPermission,
//   hasAnyPermission,
//   hasAllPermissions,
// } = require("../../config/permissions");

// const hasSpecialPrivileges = (user) => {
//   return user && (user.isOwner === true || user.isSuperAdmin === true);
// };

// // Single permission check
// const checkPermission = (requiredPermission) => {
//   return (req, res, next) => {
//     try {
//       if (!req.user || !req.user._id) {
//         return res.status(401).json({
//           status: "error",
//           message: "Authentication required",
//         });
//       }

//       // 🔥 CRITICAL FIX: Check for special privileges FIRST
//       if (hasSpecialPrivileges(req.user)) {
//         return next(); // Owners and Super Admins get full access
//       }

//       const userPermissions = req.user.permissions || [];

//       if (!hasPermission(userPermissions, requiredPermission)) {
//         return res.status(403).json({
//           status: "error",
//           message: `You don't have permission to: ${requiredPermission}`,
//           debug: {
//             userId: req.user._id,
//             email: req.user.email,
//             isOwner: req.user.isOwner,
//             isSuperAdmin: req.user.isSuperAdmin,
//             roleName: req.user.role?.name,
//             permissions: userPermissions
//           }
//         });
//       }

//       next();
//     } catch (error) {
//       console.error("Permission check error:", error);
//       return res.status(500).json({
//         status: "error",
//         message: "Permission validation failed",
//       });
//     }
//   };
// };

// // Multiple permissions (any)
// const checkAnyPermission = (requiredPermissions) => {
//   return (req, res, next) => {
//     try {
//       if (!req.user || !req.user._id) {
//         return res.status(401).json({
//           status: "error",
//           message: "Authentication required",
//         });
//       }

//       // Check for special privileges
//       if (hasSpecialPrivileges(req.user)) {
//         return next();
//       }

//       const userPermissions = req.user.permissions || [];

//       if (!hasAnyPermission(userPermissions, requiredPermissions)) {
//         return res.status(403).json({
//           status: "error",
//           message: "Insufficient permissions",
//         });
//       }

//       next();
//     } catch (error) {
//       console.error("Permission check error:", error);
//       return res.status(500).json({
//         status: "error",
//         message: "Permission validation failed",
//       });
//     }
//   };
// };

// // Multiple permissions (all)
// const checkAllPermissions = (requiredPermissions) => {
//   return (req, res, next) => {
//     try {
//       if (!req.user || !req.user._id) {
//         return res.status(401).json({
//           status: "error",
//           message: "Authentication required",
//         });
//       }

//       // Check for special privileges
//       if (hasSpecialPrivileges(req.user)) {
//         return next();
//       }

//       const userPermissions = req.user.permissions || [];

//       if (!hasAllPermissions(userPermissions, requiredPermissions)) {
//         return res.status(403).json({
//           status: "error",
//           message: "Missing required permissions",
//         });
//       }

//       next();
//     } catch (error) {
//       console.error("Permission check error:", error);
//       return res.status(500).json({
//         status: "error",
//         message: "Permission validation failed",
//       });
//     }
//   };
// };

// // Check if user is organization owner
// const checkIsOwner = () => {
//   return (req, res, next) => {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({
//         status: "error",
//         message: "Authentication required",
//       });
//     }

//     if (!req.user.isOwner && !req.user.isSuperAdmin) {
//       return res.status(403).json({
//         status: "error",
//         message: "Only organization owner can perform this action",
//       });
//     }
//     next();
//   };
// };

// // Check if user is super admin
// const checkIsSuperAdmin = () => {
//   return (req, res, next) => {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({
//         status: "error",
//         message: "Authentication required",
//       });
//     }

//     if (!req.user.isSuperAdmin) {
//       return res.status(403).json({
//         status: "error",
//         message: "Only super administrators can perform this action",
//       });
//     }
//     next();
//   };
// };

// module.exports = {
//   checkPermission,
//   checkAnyPermission,
//   checkAllPermissions,
//   checkIsOwner,
//   checkIsSuperAdmin,
//   hasSpecialPrivileges,
// };
