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

// // middleware/permissionMiddleware.js
// const {
//   hasPermission,
//   hasAnyPermission,
//   hasAllPermissions,
// } = require("../config/permissions");

// // Single permission check - SIMPLIFIED (uses permissions from auth middleware)
// const checkPermission = (requiredPermission) => {
//   return (req, res, next) => {
//     try {
//       if (!req.user || !req.user._id) {
//         return res.status(401).json({
//           status: "error",
//           message: "Authentication required",
//         });
//       }

//       const userPermissions = req.user.permissions || [];

//       // Organization owners and super admins already have ['*'] permissions
//       // So they'll automatically pass all permission checks

//       if (!hasPermission(userPermissions, requiredPermission)) {
//         return res.status(403).json({
//           status: "error",
//           message: `You don't have permission to: ${requiredPermission}`,
//           required: requiredPermission,
//           yourPermissions: userPermissions,
//           isOwner: req.user.isOwner,
//           isSuperAdmin: req.user.isSuperAdmin,
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

// // Multiple permissions (any) - SIMPLIFIED
// const checkAnyPermission = (requiredPermissions) => {
//   return (req, res, next) => {
//     try {
//       if (!req.user || !req.user._id) {
//         return res.status(401).json({
//           status: "error",
//           message: "Authentication required",
//         });
//       }

//       const userPermissions = req.user.permissions || [];

//       if (!hasAnyPermission(userPermissions, requiredPermissions)) {
//         return res.status(403).json({
//           status: "error",
//           message: "Insufficient permissions",
//           required: requiredPermissions,
//           yourPermissions: userPermissions,
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

// // Multiple permissions (all) - SIMPLIFIED
// const checkAllPermissions = (requiredPermissions) => {
//   return (req, res, next) => {
//     try {
//       if (!req.user || !req.user._id) {
//         return res.status(401).json({
//           status: "error",
//           message: "Authentication required",
//         });
//       }

//       const userPermissions = req.user.permissions || [];

//       if (!hasAllPermissions(userPermissions, requiredPermissions)) {
//         return res.status(403).json({
//           status: "error",
//           message: "Missing required permissions",
//           required: requiredPermissions,
//           yourPermissions: userPermissions,
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

// // Check if user is organization owner (alternative to authMiddleware.restrictToOwner)
// const checkIsOwner = () => {
//   return (req, res, next) => {
//     try {
//       if (!req.user || !req.user._id) {
//         return res.status(401).json({
//           status: "error",
//           message: "Authentication required",
//         });
//       }

//       if (!req.user.isOwner) {
//         return res.status(403).json({
//           status: "error",
//           message: "Only organization owner can perform this action",
//         });
//       }

//       next();
//     } catch (error) {
//       console.error("Owner check error:", error);
//       return res.status(500).json({
//         status: "error",
//         message: "Owner validation failed",
//       });
//     }
//   };
// };

// // Check if user is super admin (alternative to authMiddleware.restrictToSuperAdmin)
// const checkIsSuperAdmin = () => {
//   return (req, res, next) => {
//     try {
//       if (!req.user || !req.user._id) {
//         return res.status(401).json({
//           status: "error",
//           message: "Authentication required",
//         });
//       }

//       if (!req.user.isOwner && !req.user.isSuperAdmin) {
//         return res.status(403).json({
//           status: "error",
//           message: "Only super administrators can perform this action",
//         });
//       }

//       next();
//     } catch (error) {
//       console.error("Super admin check error:", error);
//       return res.status(500).json({
//         status: "error",
//         message: "Super admin validation failed",
//       });
//     }
//   };
// };

// module.exports = {
//   checkPermission,
//   checkAnyPermission,
//   checkAllPermissions,
//   checkIsOwner,
//   checkIsSuperAdmin,
// };

// // // middleware/permissionMiddleware.js
// // const User = require("../models/userModel");
// // const Organization = require("../models/organizationModel");
// // const {
// //   hasPermission,
// //   hasAnyPermission,
// //   hasAllPermissions,
// // } = require("../config/permissions");

// // // Helper: Check if user is organization owner
// // const isOrganizationOwner = async (userId, organizationId) => {
// //   try {
// //     const org = await Organization.findOne({
// //       _id: organizationId,
// //       owner: userId,
// //     });
// //     return !!org;
// //   } catch (error) {
// //     console.error("Error checking organization owner:", error);
// //     return false;
// //   }
// // };

// // // Helper: Get user with role and check owner status
// // const getUserWithPermissions = async (userId, organizationId) => {
// //   const user = await User.findById(userId).populate({
// //     path: "role",
// //     select: "permissions name isSuperAdmin",
// //   });

// //   if (!user) return null;

// //   // Check if user is organization owner
// //   const isOwner = await isOrganizationOwner(userId, organizationId);

// //   return {
// //     ...user.toObject(),
// //     isOrganizationOwner: isOwner,
// //     permissions: isOwner ? ["*"] : user.role?.permissions || [],
// //     isSuperAdmin: isOwner ? true : user.role?.isSuperAdmin || false,
// //   };
// // };

// // // Single permission check - ENHANCED
// // const checkPermission = (permission) => {
// //   return async (req, res, next) => {
// //     try {
// //       if (!req.user || !req.user._id) {
// //         return res.status(401).json({
// //           status: "error",
// //           message: "Authentication required",
// //         });
// //       }

// //       // Get user with permissions and owner status
// //       const userWithPerms = await getUserWithPermissions(
// //         req.user._id,
// //         req.user.organizationId,
// //       );

// //       if (!userWithPerms) {
// //         return res.status(401).json({
// //           status: "error",
// //           message: "User not found",
// //         });
// //       }

// //       // Organization owner gets full access
// //       if (userWithPerms.isOrganizationOwner) {
// //         req.userPermissions = ["*"];
// //         req.isOwner = true;
// //         req.isSuperAdmin = true;
// //         return next();
// //       }

// //       // Super Admin role gets full access
// //       if (userWithPerms.isSuperAdmin) {
// //         req.userPermissions = ["*"];
// //         req.isSuperAdmin = true;
// //         return next();
// //       }

// //       const userPermissions = userWithPerms.permissions;

// //       if (!hasPermission(userPermissions, permission)) {
// //         return res.status(403).json({
// //           status: "error",
// //           message: `You don't have permission to: ${permission}`,
// //           required: permission,
// //           yourPermissions: userPermissions,
// //         });
// //       }

// //       // Store info in request
// //       req.userPermissions = userPermissions;
// //       req.isOwner = userWithPerms.isOrganizationOwner;
// //       req.isSuperAdmin = userWithPerms.isSuperAdmin;
// //       req.userRole = userWithPerms.role?.name;

// //       next();
// //     } catch (error) {
// //       console.error("Permission check error:", error);
// //       return res.status(500).json({
// //         status: "error",
// //         message: "Permission validation failed",
// //       });
// //     }
// //   };
// // };

// // // Multiple permissions (any) - ENHANCED
// // const checkAnyPermission = (permissions) => {
// //   return async (req, res, next) => {
// //     try {
// //       if (!req.user || !req.user._id) {
// //         return res.status(401).json({
// //           status: "error",
// //           message: "Authentication required",
// //         });
// //       }

// //       const userWithPerms = await getUserWithPermissions(
// //         req.user._id,
// //         req.user.organizationId,
// //       );

// //       if (!userWithPerms) {
// //         return res.status(401).json({
// //           status: "error",
// //           message: "User not found",
// //         });
// //       }

// //       // Organization owner or Super Admin gets full access
// //       if (userWithPerms.isOrganizationOwner || userWithPerms.isSuperAdmin) {
// //         req.userPermissions = ["*"];
// //         req.isOwner = userWithPerms.isOrganizationOwner;
// //         req.isSuperAdmin = userWithPerms.isSuperAdmin;
// //         return next();
// //       }

// //       const userPermissions = userWithPerms.permissions;

// //       if (!hasAnyPermission(userPermissions, permissions)) {
// //         return res.status(403).json({
// //           status: "error",
// //           message: "Insufficient permissions",
// //           required: permissions,
// //           yourPermissions: userPermissions,
// //         });
// //       }

// //       req.userPermissions = userPermissions;
// //       req.isOwner = userWithPerms.isOrganizationOwner;
// //       req.isSuperAdmin = userWithPerms.isSuperAdmin;

// //       next();
// //     } catch (error) {
// //       console.error("Permission check error:", error);
// //       return res.status(500).json({
// //         status: "error",
// //         message: "Permission validation failed",
// //       });
// //     }
// //   };
// // };

// // // Multiple permissions (all) - ENHANCED
// // const checkAllPermissions = (permissions) => {
// //   return async (req, res, next) => {
// //     try {
// //       if (!req.user || !req.user._id) {
// //         return res.status(401).json({
// //           status: "error",
// //           message: "Authentication required",
// //         });
// //       }

// //       const userWithPerms = await getUserWithPermissions(
// //         req.user._id,
// //         req.user.organizationId,
// //       );

// //       if (!userWithPerms) {
// //         return res.status(401).json({
// //           status: "error",
// //           message: "User not found",
// //         });
// //       }

// //       // Organization owner or Super Admin gets full access
// //       if (userWithPerms.isOrganizationOwner || userWithPerms.isSuperAdmin) {
// //         req.userPermissions = ["*"];
// //         req.isOwner = userWithPerms.isOrganizationOwner;
// //         req.isSuperAdmin = userWithPerms.isSuperAdmin;
// //         return next();
// //       }

// //       const userPermissions = userWithPerms.permissions;

// //       if (!hasAllPermissions(userPermissions, permissions)) {
// //         return res.status(403).json({
// //           status: "error",
// //           message: "Missing required permissions",
// //           required: permissions,
// //           yourPermissions: userPermissions,
// //         });
// //       }

// //       req.userPermissions = userPermissions;
// //       req.isOwner = userWithPerms.isOrganizationOwner;
// //       req.isSuperAdmin = userWithPerms.isSuperAdmin;

// //       next();
// //     } catch (error) {
// //       console.error("Permission check error:", error);
// //       return res.status(500).json({
// //         status: "error",
// //         message: "Permission validation failed",
// //       });
// //     }
// //   };
// // };

// // // Check if user is organization owner
// // const checkIsOwner = () => {
// //   return async (req, res, next) => {
// //     try {
// //       if (!req.user || !req.user._id || !req.user.organizationId) {
// //         return res.status(401).json({
// //           status: "error",
// //           message: "Authentication required",
// //         });
// //       }

// //       const isOwner = await isOrganizationOwner(
// //         req.user._id,
// //         req.user.organizationId,
// //       );

// //       if (!isOwner) {
// //         return res.status(403).json({
// //           status: "error",
// //           message: "Only organization owner can perform this action",
// //         });
// //       }

// //       req.isOwner = true;
// //       req.userPermissions = ["*"];
// //       req.isSuperAdmin = true;

// //       next();
// //     } catch (error) {
// //       console.error("Owner check error:", error);
// //       return res.status(500).json({
// //         status: "error",
// //         message: "Owner validation failed",
// //       });
// //     }
// //   };
// // };

// // // Check if user is super admin (either owner or has super admin role)
// // const checkIsSuperAdmin = () => {
// //   return async (req, res, next) => {
// //     try {
// //       if (!req.user || !req.user._id) {
// //         return res.status(401).json({
// //           status: "error",
// //           message: "Authentication required",
// //         });
// //       }

// //       const userWithPerms = await getUserWithPermissions(
// //         req.user._id,
// //         req.user.organizationId,
// //       );

// //       if (!userWithPerms) {
// //         return res.status(401).json({
// //           status: "error",
// //           message: "User not found",
// //         });
// //       }

// //       const isSuperAdmin =
// //         userWithPerms.isOrganizationOwner || userWithPerms.isSuperAdmin;

// //       if (!isSuperAdmin) {
// //         return res.status(403).json({
// //           status: "error",
// //           message: "Only super administrators can perform this action",
// //         });
// //       }

// //       req.isOwner = userWithPerms.isOrganizationOwner;
// //       req.isSuperAdmin = true;
// //       req.userPermissions = ["*"];

// //       next();
// //     } catch (error) {
// //       console.error("Super admin check error:", error);
// //       return res.status(500).json({
// //         status: "error",
// //         message: "Super admin validation failed",
// //       });
// //     }
// //   };
// // };

// // module.exports = {
// //   checkPermission,
// //   checkAnyPermission,
// //   checkAllPermissions,
// //   checkIsOwner,
// //   checkIsSuperAdmin,
// // };

// // // // middleware/permissionMiddleware.js
// // // const {
// // //   hasPermission,
// // //   hasAnyPermission,
// // //   hasAllPermissions,
// // // } = require("../config/permissions");

// // // // Single permission check
// // // const checkPermission = (permission) => {
// // //   return (req, res, next) => {
// // //     try {
// // //       // Get user's permissions from token/DB
// // //       const userPermissions = req.user?.permissions || [];

// // //       if (!hasPermission(userPermissions, permission)) {
// // //         return res.status(403).json({
// // //           status: "error",
// // //           message: "You do not have permission to perform this action",
// // //         });
// // //       }

// // //       next();
// // //     } catch (error) {
// // //       console.error("Permission check error:", error);
// // //       return res.status(500).json({
// // //         status: "error",
// // //         message: "Permission validation failed",
// // //       });
// // //     }
// // //   };
// // // };

// // // // Multiple permissions (any)
// // // const checkAnyPermission = (permissions) => {
// // //   return (req, res, next) => {
// // //     try {
// // //       const userPermissions = req.user?.permissions || [];

// // //       if (!hasAnyPermission(userPermissions, permissions)) {
// // //         return res.status(403).json({
// // //           status: "error",
// // //           message: "You do not have required permissions",
// // //         });
// // //       }

// // //       next();
// // //     } catch (error) {
// // //       console.error("Permission check error:", error);
// // //       return res.status(500).json({
// // //         status: "error",
// // //         message: "Permission validation failed",
// // //       });
// // //     }
// // //   };
// // // };

// // // // Multiple permissions (all)
// // // const checkAllPermissions = (permissions) => {
// // //   return (req, res, next) => {
// // //     try {
// // //       const userPermissions = req.user?.permissions || [];

// // //       if (!hasAllPermissions(userPermissions, permissions)) {
// // //         return res.status(403).json({
// // //           status: "error",
// // //           message: "You do not have all required permissions",
// // //         });
// // //       }

// // //       next();
// // //     } catch (error) {
// // //       console.error("Permission check error:", error);
// // //       return res.status(500).json({
// // //         status: "error",
// // //         message: "Permission validation failed",
// // //       });
// // //     }
// // //   };
// // // };

// // // // Role-based permission check
// // // const checkRole = (allowedRoles) => {
// // //   return (req, res, next) => {
// // //     try {
// // //       const userRole = req.user?.role?.name || req.user?.role;

// // //       if (!userRole || !allowedRoles.includes(userRole)) {
// // //         return res.status(403).json({
// // //           status: "error",
// // //           message: "Access restricted to specific roles",
// // //         });
// // //       }

// // //       next();
// // //     } catch (error) {
// // //       console.error("Role check error:", error);
// // //       return res.status(500).json({
// // //         status: "error",
// // //         message: "Role validation failed",
// // //       });
// // //     }
// // //   };
// // // };

// // // module.exports = {
// // //   checkPermission,
// // //   checkAnyPermission,
// // //   checkAllPermissions,
// // //   checkRole,
// // // };
// // // // const AppError = require('../utils/appError');
// // // // const Role = require('../models/roleModel'); // Ensure path is correct

// // // // exports.checkPermission = (requiredPermission) => {
// // // //   return async (req, res, next) => {
// // // //     // 1. Check if Auth Middleware ran
// // // //     if (!req.user) {
// // // //       return next(new AppError('Not authenticated. Please login.', 401));
// // // //     }

// // // //     // 2. Load Role (if not already loaded by protect middleware)
// // // //     // Optimization: Assuming req.user.role is an ObjectId, we might need to fetch it
// // // //     let role = req.user.roleDetails; // Suppose protect() populates this

// // // //     if (!role && req.user.role) {
// // // //        role = await Role.findById(req.user.role);
// // // //     }

// // // //     if (!role) {
// // // //       return next(new AppError('Role not found for this user.', 403));
// // // //     }

// // // //     // 3. SUPER ADMIN BYPASS
// // // //     if (role.isSuperAdmin) {
// // // //       return next();
// // // //     }

// // // //     // 4. Check Tag
// // // //     if (!role.permissions.includes(requiredPermission)) {
// // // //       return next(new AppError(`Access Denied. Required permission: ${requiredPermission}`, 403));
// // // //     }

// // // //     next();
// // // //   };
// // // // };
