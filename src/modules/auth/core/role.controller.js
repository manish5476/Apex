// controllers/roleController.js
const Role = require("./role.model");
const User = require("./user.model");
const Organization = require("../../organization/core/organization.model");
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const { VALID_TAGS } = require("../../../config/permissions");

// Helper: Check if user can manage roles
const canManageRoles = async (userId, organizationId) => {
  try {
    // Check if user is organization owner
    const isOwner = await Organization.exists({
      _id: organizationId,
      owner: userId,
    });

    if (isOwner) return true;

    // Check if user has super admin role
    const user = await User.findById(userId).populate({
      path: "role",
      select: "isSuperAdmin",
    });

    return user?.role?.isSuperAdmin || false;
  } catch (error) {
    return false;
  }
};

// Create a role - ONLY owners or super admins
exports.createRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const {
    name,
    permissions = [],
    isDefault = false,
    isSuperAdmin = false,
  } = req.body;

  if (!name) return next(new AppError("Role name required", 400));

  // Check if user can manage roles
  const canManage = await canManageRoles(req.user._id, orgId);
  if (!canManage) {
    return next(
      new AppError(
        "Only organization owners or super admins can create roles",
        403,
      ),
    );
  }

  // Validate permissions
  const invalidPermissions = permissions.filter((p) => !VALID_TAGS.includes(p));
  if (invalidPermissions.length > 0) {
    return next(
      new AppError(
        `Invalid permissions: ${invalidPermissions.join(", ")}`,
        400,
      ),
    );
  }

  // Check if role name already exists in organization
  const existingRole = await Role.findOne({
    organizationId: orgId,
    name: { $regex: new RegExp(`^${name}$`, "i") },
  });

  if (existingRole) {
    return next(
      new AppError(
        "Role with this name already exists in your organization",
        400,
      ),
    );
  }

  // Only owners can create super admin roles
  if (isSuperAdmin && !req.user.isOwner) {
    return next(
      new AppError(
        "Only organization owners can create super admin roles",
        403,
      ),
    );
  }

  const role = await Role.create({
    name,
    organizationId: orgId,
    permissions,
    isDefault,
    isSuperAdmin,
    createdBy: req.user._id,
  });

  res.status(201).json({
    status: "success",
    message: "Role created successfully",
    data: { role },
  });
});

// Get all roles for org - owners see all, others see non-super-admin roles
exports.getRoles = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;

  let query = { organizationId: orgId };

  // Non-owners cannot see super admin roles
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    query.isSuperAdmin = false;
  }

  const roles = await Role.find(query).sort({
    isSuperAdmin: -1,
    isDefault: -1,
    name: 1,
  });

  res.status(200).json({
    status: "success",
    results: roles.length,
    data: { roles },
  });
});

// Get single role - with security checks
exports.getRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const roleId = req.params.id;

  let query = {
    _id: roleId,
    organizationId: orgId,
  };

  // Non-owners cannot see super admin roles
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    query.isSuperAdmin = false;
  }

  const role = await Role.findOne(query);

  if (!role) return next(new AppError("Role not found", 404));

  // Get users assigned to this role
  const users = await User.find({
    organizationId: orgId,
    role: roleId,
  }).select("name email status branchId");

  res.status(200).json({
    status: "success",
    data: {
      role,
      assignedUsers: users,
      userCount: users.length,
    },
  });
});

// Update role - with security checks
exports.updateRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const roleId = req.params.id;
  const updates = req.body;

  // Check if user can manage roles
  const canManage = await canManageRoles(req.user._id, orgId);
  if (!canManage) {
    return next(
      new AppError(
        "Only organization owners or super admins can update roles",
        403,
      ),
    );
  }

  // Don't allow updating super admin role unless you're owner
  const existingRole = await Role.findOne({
    _id: roleId,
    organizationId: orgId,
  });
  if (!existingRole) return next(new AppError("Role not found", 404));

  if (existingRole.isSuperAdmin && !req.user.isOwner) {
    return next(
      new AppError(
        "Only organization owners can modify super admin roles",
        403,
      ),
    );
  }

  // Only owners can make roles super admin
  if (updates.isSuperAdmin && !req.user.isOwner) {
    return next(
      new AppError(
        "Only organization owners can create super admin roles",
        403,
      ),
    );
  }

  // Validate permissions if being updated
  if (updates.permissions) {
    const invalidPermissions = updates.permissions.filter(
      (p) => !VALID_TAGS.includes(p),
    );
    if (invalidPermissions.length > 0) {
      return next(
        new AppError(
          `Invalid permissions: ${invalidPermissions.join(", ")}`,
          400,
        ),
      );
    }
  }

  // Check if name change causes conflict
  if (updates.name && updates.name !== existingRole.name) {
    const nameExists = await Role.findOne({
      organizationId: orgId,
      name: { $regex: new RegExp(`^${updates.name}$`, "i") },
      _id: { $ne: roleId },
    });

    if (nameExists) {
      return next(
        new AppError("Another role with this name already exists", 400),
      );
    }
  }

  const role = await Role.findOneAndUpdate(
    { _id: roleId, organizationId: orgId },
    updates,
    { new: true, runValidators: true },
  );

  res.status(200).json({
    status: "success",
    message: "Role updated successfully",
    data: { role },
  });
});

// Delete role - with security checks
exports.deleteRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const roleId = req.params.id;

  // Check if user can manage roles
  const canManage = await canManageRoles(req.user._id, orgId);
  if (!canManage) {
    return next(
      new AppError(
        "Only organization owners or super admins can delete roles",
        403,
      ),
    );
  }

  // Check if role exists
  const role = await Role.findOne({ _id: roleId, organizationId: orgId });
  if (!role) return next(new AppError("Role not found", 404));

  // Prevent deletion of super admin role unless by owner
  if (role.isSuperAdmin && !req.user.isOwner) {
    return next(
      new AppError(
        "Only organization owners can delete super admin roles",
        403,
      ),
    );
  }

  // Check if any users are assigned this role
  const userCount = await User.countDocuments({
    organizationId: orgId,
    role: roleId,
  });

  if (userCount > 0) {
    return next(
      new AppError(
        `Cannot delete role. ${userCount} user(s) are assigned this role.`,
        400,
      ),
    );
  }

  await Role.findByIdAndDelete(roleId);

  res.status(200).json({
    status: "success",
    message: "Role deleted successfully",
    data: null,
  });
});

// Get available permissions for UI
exports.getAvailablePermissions = catchAsync(async (req, res) => {
  const { PERMISSIONS_LIST } = require("../../../config/permissions");
  let filteredPermissions = PERMISSIONS_LIST;

  // If not owner or super admin, filter out sensitive permissions
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    // Define which permissions are sensitive (only for owners/super admins)
    const sensitiveGroups = ["System", "Organization", "Platform"];
    filteredPermissions = PERMISSIONS_LIST.filter(
      (perm) => !sensitiveGroups.includes(perm.group),
    );
  }

  // Group by category
  const groupedPermissions = filteredPermissions.reduce((acc, perm) => {
    if (!acc[perm.group]) {
      acc[perm.group] = [];
    }
    acc[perm.group].push({
      tag: perm.tag,
      description: perm.description,
    });
    return acc;
  }, {});

  res.status(200).json({
    status: "success",
    data: {
      allPermissions: filteredPermissions,
      groupedPermissions,
      totalPermissions: filteredPermissions.length,
      canManageSensitive: req.user.isOwner || req.user.isSuperAdmin,
    },
  });
});

// Assign role to user - owners/super admins only
exports.assignRoleToUser = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { userId, roleId } = req.body;

  if (!userId || !roleId) {
    return next(new AppError("User ID and Role ID are required", 400));
  }

  // Check if user can manage roles
  const canManage = await canManageRoles(req.user._id, orgId);
  if (!canManage) {
    return next(
      new AppError(
        "Only organization owners or super admins can assign roles",
        403,
      ),
    );
  }

  // Check if target user belongs to same organization
  const targetUser = await User.findOne({
    _id: userId,
    organizationId: orgId,
  });

  if (!targetUser) {
    return next(new AppError("User not found in your organization", 404));
  }

  // Check if role exists and belongs to organization
  const role = await Role.findOne({
    _id: roleId,
    organizationId: orgId,
  });

  if (!role) {
    return next(new AppError("Role not found in your organization", 404));
  }

  // Non-owners cannot assign super admin roles
  if (role.isSuperAdmin && !req.user.isOwner) {
    return next(
      new AppError(
        "Only organization owners can assign super admin roles",
        403,
      ),
    );
  }

  // Update user's role
  targetUser.role = roleId;
  await targetUser.save();

  // Update role user count
  await Role.findByIdAndUpdate(roleId, {
    $inc: { userCount: 1 },
  });

  res.status(200).json({
    status: "success",
    message: "Role assigned successfully",
    data: {
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
      },
      role: {
        id: role._id,
        name: role.name,
      },
    },
  });
});
// // controllers/roleController.js
// const Role = require("../models/roleModel");
// const User = require("../models/userModel");
// const Organization = require("../models/organizationModel");
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const { VALID_TAGS } = require("../config/permissions");

// // Helper: Check if user can manage roles
// const canManageRoles = async (userId, organizationId) => {
//   try {
//     // Check if user is organization owner
//     const isOwner = await Organization.exists({
//       _id: organizationId,
//       owner: userId,
//     });

//     if (isOwner) return true;

//     // Check if user has super admin role
//     const user = await User.findById(userId).populate({
//       path: "role",
//       select: "isSuperAdmin",
//     });

//     return user?.role?.isSuperAdmin || false;
//   } catch (error) {
//     return false;
//   }
// };

// // Create a role - ONLY owners or super admins
// exports.createRole = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const {
//     name,
//     permissions = [],
//     isDefault = false,
//     isSuperAdmin = false,
//   } = req.body;

//   if (!name) return next(new AppError("Role name required", 400));

//   // Check if user can manage roles
//   const canManage = await canManageRoles(req.user._id, orgId);
//   if (!canManage) {
//     return next(
//       new AppError(
//         "Only organization owners or super admins can create roles",
//         403,
//       ),
//     );
//   }

//   // Validate permissions
//   const invalidPermissions = permissions.filter((p) => !VALID_TAGS.includes(p));
//   if (invalidPermissions.length > 0) {
//     return next(
//       new AppError(
//         `Invalid permissions: ${invalidPermissions.join(", ")}`,
//         400,
//       ),
//     );
//   }

//   // Check if role name already exists in organization
//   const existingRole = await Role.findOne({
//     organizationId: orgId,
//     name: { $regex: new RegExp(`^${name}$`, "i") },
//   });

//   if (existingRole) {
//     return next(
//       new AppError(
//         "Role with this name already exists in your organization",
//         400,
//       ),
//     );
//   }

//   // Only owners can create super admin roles
//   if (isSuperAdmin && !req.user.isOwner) {
//     return next(
//       new AppError(
//         "Only organization owners can create super admin roles",
//         403,
//       ),
//     );
//   }

//   const role = await Role.create({
//     name,
//     organizationId: orgId,
//     permissions,
//     isDefault,
//     isSuperAdmin,
//     createdBy: req.user._id,
//   });

//   res.status(201).json({
//     status: "success",
//     message: "Role created successfully",
//     data: { role },
//   });
// });

// // Get all roles for org - owners see all, others see non-super-admin roles
// exports.getRoles = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;

//   let query = { organizationId: orgId };

//   // Non-owners cannot see super admin roles
//   if (!req.user.isOwner && !req.user.isSuperAdmin) {
//     query.isSuperAdmin = false;
//   }

//   const roles = await Role.find(query).sort({
//     isSuperAdmin: -1,
//     isDefault: -1,
//     name: 1,
//   });

//   res.status(200).json({
//     status: "success",
//     results: roles.length,
//     data: { roles },
//   });
// });

// // Get single role - with security checks
// exports.getRole = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const roleId = req.params.id;

//   let query = {
//     _id: roleId,
//     organizationId: orgId,
//   };

//   // Non-owners cannot see super admin roles
//   if (!req.user.isOwner && !req.user.isSuperAdmin) {
//     query.isSuperAdmin = false;
//   }

//   const role = await Role.findOne(query);

//   if (!role) return next(new AppError("Role not found", 404));

//   // Get users assigned to this role
//   const users = await User.find({
//     organizationId: orgId,
//     role: roleId,
//   }).select("name email status branchId");

//   res.status(200).json({
//     status: "success",
//     data: {
//       role,
//       assignedUsers: users,
//       userCount: users.length,
//     },
//   });
// });

// // Update role - with security checks
// exports.updateRole = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const roleId = req.params.id;
//   const updates = req.body;

//   // Check if user can manage roles
//   const canManage = await canManageRoles(req.user._id, orgId);
//   if (!canManage) {
//     return next(
//       new AppError(
//         "Only organization owners or super admins can update roles",
//         403,
//       ),
//     );
//   }

//   // Don't allow updating super admin role unless you're owner
//   const existingRole = await Role.findOne({
//     _id: roleId,
//     organizationId: orgId,
//   });
//   if (!existingRole) return next(new AppError("Role not found", 404));

//   if (existingRole.isSuperAdmin && !req.user.isOwner) {
//     return next(
//       new AppError(
//         "Only organization owners can modify super admin roles",
//         403,
//       ),
//     );
//   }

//   // Only owners can make roles super admin
//   if (updates.isSuperAdmin && !req.user.isOwner) {
//     return next(
//       new AppError(
//         "Only organization owners can create super admin roles",
//         403,
//       ),
//     );
//   }

//   // Validate permissions if being updated
//   if (updates.permissions) {
//     const invalidPermissions = updates.permissions.filter(
//       (p) => !VALID_TAGS.includes(p),
//     );
//     if (invalidPermissions.length > 0) {
//       return next(
//         new AppError(
//           `Invalid permissions: ${invalidPermissions.join(", ")}`,
//           400,
//         ),
//       );
//     }
//   }

//   // Check if name change causes conflict
//   if (updates.name && updates.name !== existingRole.name) {
//     const nameExists = await Role.findOne({
//       organizationId: orgId,
//       name: { $regex: new RegExp(`^${updates.name}$`, "i") },
//       _id: { $ne: roleId },
//     });

//     if (nameExists) {
//       return next(
//         new AppError("Another role with this name already exists", 400),
//       );
//     }
//   }

//   const role = await Role.findOneAndUpdate(
//     { _id: roleId, organizationId: orgId },
//     updates,
//     { new: true, runValidators: true },
//   );

//   res.status(200).json({
//     status: "success",
//     message: "Role updated successfully",
//     data: { role },
//   });
// });

// // Delete role - with security checks
// exports.deleteRole = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const roleId = req.params.id;

//   // Check if user can manage roles
//   const canManage = await canManageRoles(req.user._id, orgId);
//   if (!canManage) {
//     return next(
//       new AppError(
//         "Only organization owners or super admins can delete roles",
//         403,
//       ),
//     );
//   }

//   // Check if role exists
//   const role = await Role.findOne({ _id: roleId, organizationId: orgId });
//   if (!role) return next(new AppError("Role not found", 404));

//   // Prevent deletion of super admin role unless by owner
//   if (role.isSuperAdmin && !req.user.isOwner) {
//     return next(
//       new AppError(
//         "Only organization owners can delete super admin roles",
//         403,
//       ),
//     );
//   }

//   // Check if any users are assigned this role
//   const userCount = await User.countDocuments({
//     organizationId: orgId,
//     role: roleId,
//   });

//   if (userCount > 0) {
//     return next(
//       new AppError(
//         `Cannot delete role. ${userCount} user(s) are assigned this role.`,
//         400,
//       ),
//     );
//   }

//   await Role.findByIdAndDelete(roleId);

//   res.status(200).json({
//     status: "success",
//     message: "Role deleted successfully",
//     data: null,
//   });
// });

// // Get available permissions for UI
// exports.getAvailablePermissions = catchAsync(async (req, res) => {
//   // Organization owners see all permissions
//   // Non-owners might see limited permissions based on their role
//   const { PERMISSIONS_LIST } = require("../config/permissions");

//   let filteredPermissions = PERMISSIONS_LIST;

//   // If not owner or super admin, filter out sensitive permissions
//   if (!req.user.isOwner && !req.user.isSuperAdmin) {
//     // Define which permissions are sensitive (only for owners/super admins)
//     const sensitiveGroups = ["System", "Organization", "Platform"];
//     filteredPermissions = PERMISSIONS_LIST.filter(
//       (perm) => !sensitiveGroups.includes(perm.group),
//     );
//   }

//   // Group by category
//   const groupedPermissions = filteredPermissions.reduce((acc, perm) => {
//     if (!acc[perm.group]) {
//       acc[perm.group] = [];
//     }
//     acc[perm.group].push({
//       tag: perm.tag,
//       description: perm.description,
//     });
//     return acc;
//   }, {});

//   res.status(200).json({
//     status: "success",
//     data: {
//       allPermissions: filteredPermissions,
//       groupedPermissions,
//       totalPermissions: filteredPermissions.length,
//       canManageSensitive: req.user.isOwner || req.user.isSuperAdmin,
//     },
//   });
// });

// // Assign role to user - owners/super admins only
// exports.assignRoleToUser = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { userId, roleId } = req.body;

//   if (!userId || !roleId) {
//     return next(new AppError("User ID and Role ID are required", 400));
//   }

//   // Check if user can manage roles
//   const canManage = await canManageRoles(req.user._id, orgId);
//   if (!canManage) {
//     return next(
//       new AppError(
//         "Only organization owners or super admins can assign roles",
//         403,
//       ),
//     );
//   }

//   // Check if target user belongs to same organization
//   const targetUser = await User.findOne({
//     _id: userId,
//     organizationId: orgId,
//   });

//   if (!targetUser) {
//     return next(new AppError("User not found in your organization", 404));
//   }

//   // Check if role exists and belongs to organization
//   const role = await Role.findOne({
//     _id: roleId,
//     organizationId: orgId,
//   });

//   if (!role) {
//     return next(new AppError("Role not found in your organization", 404));
//   }

//   // Non-owners cannot assign super admin roles
//   if (role.isSuperAdmin && !req.user.isOwner) {
//     return next(
//       new AppError(
//         "Only organization owners can assign super admin roles",
//         403,
//       ),
//     );
//   }

//   // Update user's role
//   targetUser.role = roleId;
//   await targetUser.save();

//   // Update role user count
//   await Role.findByIdAndUpdate(roleId, {
//     $inc: { userCount: 1 },
//   });

//   res.status(200).json({
//     status: "success",
//     message: "Role assigned successfully",
//     data: {
//       user: {
//         id: targetUser._id,
//         name: targetUser.name,
//         email: targetUser.email,
//       },
//       role: {
//         id: role._id,
//         name: role.name,
//       },
//     },
//   });
// });

// // // controllers/roleController.js
// // const Role = require('../models/roleModel');
// // const catchAsync = require('../utils/catchAsync');
// // const AppError = require('../utils/appError');

// // // Create a role
// // exports.createRole = catchAsync(async (req, res, next) => {
// //   const orgId = req.user.organizationId;
// //   const { name, permissions = [], isDefault = false, isSuperAdmin = false } = req.body;
// //   if (!name) return next(new AppError('Role name required', 400));
// //   const role = await Role.create({
// //     name,
// //     organizationId: orgId,
// //     permissions,
// //     isDefault,
// //     isSuperAdmin
// //   });

// //   res.status(201).json({ status: 'success', data: { role } });
// // });

// // // Get all roles for org
// // exports.getRoles = catchAsync(async (req, res, next) => {
// //   const orgId = req.user.organizationId;
// //   const roles = await Role.find({ organizationId: orgId }).sort({ isSuperAdmin: -1, name: 1 });
// //   res.status(200).json({ status: 'success', results: roles.length, data: { roles } });
// // });

// // // Update role
// // exports.updateRole = catchAsync(async (req, res, next) => {
// //   const orgId = req.user.organizationId;
// //   const roleId = req.params.id;
// //   const updates = req.body;
// //   const role = await Role.findOneAndUpdate({ _id: roleId, organizationId: orgId }, updates, { new: true });
// //   if (!role) return next(new AppError('Role not found', 404));
// //   res.status(200).json({ status: 'success', data: { role } });
// // });

// // // Delete role
// // exports.deleteRole = catchAsync(async (req, res, next) => {
// //   const orgId = req.user.organizationId;
// //   const roleId = req.params.id;
// //   const role = await Role.findOneAndDelete({ _id: roleId, organizationId: orgId });
// //   if (!role) return next(new AppError('Role not found', 404));
// //   res.status(204).json({ status: 'success', data: null });
// // });
