'use strict';

const Role = require("./role.model");
const User = require("./user.model");
const catchAsync = require("../../../core/utils/api/catchAsync");
const AppError = require("../../../core/utils/api/appError");
const { VALID_TAGS, PERMISSIONS_LIST } = require("../../../config/permissions");

// ======================================================
//  INTERNAL HELPERS
// ======================================================

/**
 * Sensitive permission groups — only owners can create/assign roles with these
 */
const SENSITIVE_GROUPS = ["System", "Organization", "Platform"];
const SENSITIVE_TAGS = new Set(
  PERMISSIONS_LIST.filter(p => SENSITIVE_GROUPS.includes(p.group)).map(p => p.tag)
);

/**
 * Emit a socket event scoped to a role room.
 * Called after any permission mutation so connected clients re-fetch.
 */
const emitRolePermissionsUpdated = (io, role) => {
  if (!io) return console.warn('[SOCKET DEBUG] io instance missing in emitRolePermissionsUpdated');
  const roomId = `role:${String(role._id)}`;
  console.log(`[SOCKET DEBUG] Emitting role update to room ${roomId}`);
  io.to(roomId).emit('permissions:updated', {
    type: 'role',
    roleId: String(role._id),
    permissions: role.permissions,
    timestamp: new Date().toISOString()
  });
};

/**
 * Emit a socket event to a specific user when their role is changed.
 * The client re-fetches merged permissions and rejoins the correct role room.
 */
const emitUserRoleChanged = (io, userId, roleId) => {
  if (!io) return console.warn('[SOCKET DEBUG] io instance missing in emitUserRoleChanged');
    const roomId = `user:${String(userId)}`;
    
    // 💡 DIAGNOSTIC: Check if anyone is actually in this room
    const room = io.sockets.adapter.rooms.get(roomId);
    const memberCount = room ? room.size : 0;
    
    console.log(`[SOCKET DEBUG] Emitting role_assigned update to room ${roomId} (${memberCount} active members)`);
    
    io.to(roomId).emit('permissions:updated', {
      type: 'role_assigned',
      roleId: String(roleId),
      userId: String(userId),
      timestamp: new Date().toISOString()
    });
};

// ======================================================
//  ROLE CRUD
// ======================================================

/**
 * @desc    Create role
 * @route   POST /api/v1/roles
 * @access  Private (role:manage)
 */
exports.createRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { name, permissions = [], isDefault = false, isSuperAdmin = false } = req.body;

  if (!name) return next(new AppError("Role name is required", 400));

  // Only owners can create super-admin roles
  if (isSuperAdmin && !req.user.isOwner) {
    return next(new AppError("Only organization owners can create super admin roles", 403));
  }

  // Validate permission tags
  const invalid = permissions.filter(p => !VALID_TAGS.includes(p));
  if (invalid.length) {
    return next(new AppError(`Invalid permissions: ${invalid.join(", ")}`, 400));
  }

  // Only owners can include sensitive permissions
  if (!req.user.isOwner && permissions.some(p => SENSITIVE_TAGS.has(p))) {
    return next(new AppError("Only owners can assign system-level permissions to a role", 403));
  }

  // Duplicate name check (case-insensitive)
  const exists = await Role.exists({
    organizationId: orgId,
    name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
  });
  if (exists) return next(new AppError("Role name already exists in your organization", 400));

  const role = await Role.create({
    name: name.trim(),
    organizationId: orgId,
    permissions,
    isDefault,
    isSuperAdmin,
    createdBy: req.user._id
  });

  res.status(201).json({
    status: "success",
    message: "Role created",
    data: { role }
  });
});

/**
 * @desc    Get all roles
 * @route   GET /api/v1/roles
 * @access  Private (role:manage)
 */
exports.getRoles = catchAsync(async (req, res) => {
  const orgId = req.user.organizationId;
  const query = { organizationId: orgId };

  // Non-owners/non-superadmins can't see superadmin roles
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    query.isSuperAdmin = false;
  }

  const roles = await Role.find(query)
    .sort({ isSuperAdmin: -1, isDefault: -1, name: 1 })
    .lean();

  // Attach user count to each role
  const counts = await User.aggregate([
    { $match: { organizationId: orgId, role: { $in: roles.map(r => r._id) } } },
    { $group: { _id: "$role", count: { $sum: 1 } } }
  ]);

  const countMap = counts.reduce((acc, c) => {
    acc[String(c._id)] = c.count;
    return acc;
  }, {});

  const rolesWithCount = roles.map(r => ({
    ...r,
    userCount: countMap[String(r._id)] || 0
  }));

  res.status(200).json({
    status: "success",
    results: roles.length,
    data: { roles: rolesWithCount }
  });
});

/**
 * @desc    Get single role with assigned users
 * @route   GET /api/v1/roles/:id
 * @access  Private (role:manage)
 */
exports.getRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const query = { _id: req.params.id, organizationId: orgId };

  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    query.isSuperAdmin = false;
  }

  const role = await Role.findOne(query).lean();
  if (!role) return next(new AppError("Role not found", 404));

  const users = await User.find({ organizationId: orgId, role: req.params.id })
    .select("name email status branchId avatar employeeProfile.employeeId")
    .populate("branchId", "name")
    .lean();

  res.status(200).json({
    status: "success",
    data: { role, assignedUsers: users, userCount: users.length }
  });
});

/**
 * @desc    Update role
 * @route   PATCH /api/v1/roles/:id
 * @access  Private (role:manage)
 */
exports.updateRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const roleId = req.params.id;
  const updates = req.body;

  // Strip fields that should never be updated directly
  delete updates.organizationId;
  delete updates.createdBy;

  const existing = await Role.findOne({ _id: roleId, organizationId: orgId });
  if (!existing) return next(new AppError("Role not found", 404));

  // SuperAdmin role protection
  if (existing.isSuperAdmin && !req.user.isOwner) {
    return next(new AppError("Only owners can modify super admin roles", 403));
  }

  // Promoting to superAdmin requires owner
  if (updates.isSuperAdmin && !req.user.isOwner) {
    return next(new AppError("Only owners can promote a role to super admin", 403));
  }

  // Validate permissions if being updated
  if (updates.permissions) {
    const invalid = updates.permissions.filter(p => !VALID_TAGS.includes(p));
    if (invalid.length) {
      return next(new AppError(`Invalid permissions: ${invalid.join(", ")}`, 400));
    }

    // Only owners can add sensitive permissions
    if (!req.user.isOwner && updates.permissions.some(p => SENSITIVE_TAGS.has(p))) {
      return next(new AppError("Only owners can assign system-level permissions to a role", 403));
    }
  }

  // Duplicate name check (excluding self)
  if (updates.name && updates.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await Role.exists({
      organizationId: orgId,
      name: { $regex: new RegExp(`^${updates.name.trim()}$`, "i") },
      _id: { $ne: roleId }
    });
    if (clash) return next(new AppError("Another role with this name already exists", 400));
  }

  if (updates.name) updates.name = updates.name.trim();

  const role = await Role.findOneAndUpdate(
    { _id: roleId, organizationId: orgId },
    updates,
    { new: true, runValidators: true }
  );

  // ✅ Emit to role room — only users with this role re-fetch permissions
  if (updates.permissions) {
    const io = req.app.get('io');
    emitRolePermissionsUpdated(io, role);
  }

  res.status(200).json({
    status: "success",
    message: "Role updated",
    data: { role }
  });
});

/**
 * @desc    Delete role
 * @route   DELETE /api/v1/roles/:id
 * @access  Private (role:manage)
 */
exports.deleteRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const roleId = req.params.id;

  const role = await Role.findOne({ _id: roleId, organizationId: orgId });
  if (!role) return next(new AppError("Role not found", 404));

  // Only owners can delete superAdmin roles
  if (role.isSuperAdmin && !req.user.isOwner) {
    return next(new AppError("Only owners can delete super admin roles", 403));
  }

  // Prevent deletion if users are still assigned
  const count = await User.countDocuments({ organizationId: orgId, role: roleId });
  if (count > 0) {
    return next(new AppError(`Cannot delete — ${count} user(s) still assigned this role. Reassign them first.`, 400));
  }

  await Role.findByIdAndDelete(roleId);

  res.status(200).json({
    status: "success",
    message: "Role deleted",
    data: null
  });
});

// ======================================================
//  PERMISSIONS METADATA
// ======================================================

/**
 * @desc    Get available permissions for UI dropdowns
 * @route   GET /api/v1/roles/permissions
 * @access  Private (role:manage)
 */
exports.getAvailablePermissions = catchAsync(async (req, res) => {
  // Filter out sensitive groups for non-owners
  const list = (req.user.isOwner || req.user.isSuperAdmin)
    ? PERMISSIONS_LIST
    : PERMISSIONS_LIST.filter(p => !SENSITIVE_GROUPS.includes(p.group));

  const groups = [...new Set(list.map(p => p.group))];

  const grouped = list.reduce((acc, p) => {
    (acc[p.group] ??= []).push({ tag: p.tag, description: p.description });
    return acc;
  }, {});

  res.status(200).json({
    status: "success",
    data: {
      groups,
      groupedPermissions: grouped,
      total: list.length,
      canManageSensitive: req.user.isOwner || req.user.isSuperAdmin
    }
  });
});

// ======================================================
//  ROLE ASSIGNMENT
// ======================================================

/**
 * @desc    Assign role to a user
 * @route   POST /api/v1/roles/assign
 * @access  Private (role:manage)
 */
exports.assignRoleToUser = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { userId, roleId } = req.body;

  if (!userId || !roleId) {
    return next(new AppError("userId and roleId are required", 400));
  }

  // Parallel fetch
  const [targetUser, role] = await Promise.all([
    User.findOne({ _id: userId, organizationId: orgId }),
    Role.findOne({ _id: roleId, organizationId: orgId })
  ]);

  if (!targetUser) return next(new AppError("User not found in your organization", 404));
  if (!role) return next(new AppError("Role not found in your organization", 404));

  // Only owners can assign superAdmin roles
  if (role.isSuperAdmin && !req.user.isOwner) {
    return next(new AppError("Only owners can assign super admin roles", 403));
  }

  // Prevent assigning to the org owner
  if (targetUser.isOwner) {
    return next(new AppError("Cannot change the role of the organization owner", 403));
  }

  const previousRoleId = targetUser.role ? String(targetUser.role) : null;
  targetUser.role = roleId;
  targetUser.updatedBy = req.user._id;
  await targetUser.save({ validateBeforeSave: false });

  // ✅ Emit to user's socket room — they re-fetch permissions and rejoin role room
  const io = req.app.get('io');
  emitUserRoleChanged(io, userId, roleId);

  res.status(200).json({
    status: "success",
    message: "Role assigned successfully",
    data: {
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        previousRoleId
      },
      role: { id: role._id, name: role.name }
    }
  });
});

/**
 * @desc    Bulk assign role to multiple users
 * @route   POST /api/v1/roles/assign-bulk
 * @access  Private (role:manage)
 */
exports.assignRoleBulk = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { userIds, roleId } = req.body;

  if (!Array.isArray(userIds) || !userIds.length || !roleId) {
    return next(new AppError("userIds (array) and roleId are required", 400));
  }

  const role = await Role.findOne({ _id: roleId, organizationId: orgId });
  if (!role) return next(new AppError("Role not found", 404));

  if (role.isSuperAdmin && !req.user.isOwner) {
    return next(new AppError("Only owners can assign super admin roles", 403));
  }

  const result = await User.updateMany(
    {
      _id: { $in: userIds },
      organizationId: orgId,
      isOwner: { $ne: true }  // Never change owner's role
    },
    { $set: { role: roleId, updatedBy: req.user._id } }
  );

  // ✅ Emit to each affected user's socket room
  const io = req.app.get('io');
  if (io) {
    userIds.forEach(uid => emitUserRoleChanged(io, uid, roleId));
  }

  res.status(200).json({
    status: "success",
    message: `Role assigned to ${result.modifiedCount} user(s)`,
    data: {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      role: { id: role._id, name: role.name }
    }
  });
});
// const Role = require("./role.model");
// const User = require("./user.model");
// const Organization = require("../../organization/core/organization.model");
// const catchAsync = require("../../../core/utils/api/catchAsync");
// const AppError = require("../../../core/utils/api/appError");
// const { VALID_TAGS, PERMISSIONS_LIST } = require("../../../config/permissions");

// // ─── NO canManageRoles() — middleware already guaranteed this ──────────────

// exports.createRole = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { name, permissions = [], isDefault = false, isSuperAdmin = false } = req.body;

//   if (!name) return next(new AppError("Role name required", 400));

//   // Only owners can create super-admin roles
//   if (isSuperAdmin && !req.user.isOwner) {
//     return next(new AppError("Only organization owners can create super admin roles", 403));
//   }

//   const invalid = permissions.filter(p => !VALID_TAGS.includes(p));
//   if (invalid.length) return next(new AppError(`Invalid permissions: ${invalid.join(", ")}`, 400));

//   const exists = await Role.exists({
//     organizationId: orgId,
//     name: { $regex: new RegExp(`^${name}$`, "i") },
//   });
//   if (exists) return next(new AppError("Role name already exists in your organization", 400));

//   const role = await Role.create({
//     name,
//     organizationId: orgId,
//     permissions,
//     isDefault,
//     isSuperAdmin,
//     createdBy: req.user._id,
//   });

//   res.status(201).json({ status: "success", message: "Role created", data: { role } });
// });

// exports.getRoles = catchAsync(async (req, res) => {
//   const orgId = req.user.organizationId;
//   const query = { organizationId: orgId };
//   if (!req.user.isOwner && !req.user.isSuperAdmin) query.isSuperAdmin = false;

//   const roles = await Role.find(query).sort({ isSuperAdmin: -1, isDefault: -1, name: 1 });
//   res.status(200).json({ status: "success", results: roles.length, data: { roles } });
// });

// exports.getRole = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const query = { _id: req.params.id, organizationId: orgId };
//   if (!req.user.isOwner && !req.user.isSuperAdmin) query.isSuperAdmin = false;

//   const role = await Role.findOne(query);
//   if (!role) return next(new AppError("Role not found", 404));

//   const users = await User.find({ organizationId: orgId, role: req.params.id })
//     .select("name email status branchId");

//   res.status(200).json({
//     status: "success",
//     data: { role, assignedUsers: users, userCount: users.length },
//   });
// });

// exports.updateRole = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const roleId = req.params.id;
//   const updates = req.body;

//   const existing = await Role.findOne({ _id: roleId, organizationId: orgId });
//   if (!existing) return next(new AppError("Role not found", 404));

//   if (existing.isSuperAdmin && !req.user.isOwner)
//     return next(new AppError("Only owners can modify super admin roles", 403));

//   if (updates.isSuperAdmin && !req.user.isOwner)
//     return next(new AppError("Only owners can promote a role to super admin", 403));

//   if (updates.permissions) {
//     const invalid = updates.permissions.filter(p => !VALID_TAGS.includes(p));
//     if (invalid.length) return next(new AppError(`Invalid permissions: ${invalid.join(", ")}`, 400));
//   }

//   if (updates.name && updates.name !== existing.name) {
//     const clash = await Role.exists({
//       organizationId: orgId,
//       name: { $regex: new RegExp(`^${updates.name}$`, "i") },
//       _id: { $ne: roleId },
//     });
//     if (clash) return next(new AppError("Another role with this name already exists", 400));
//   }

//   const role = await Role.findOneAndUpdate(
//     { _id: roleId, organizationId: orgId },
//     updates,
//     { new: true, runValidators: true }
//   );
  
//   // ADD THIS ↓
//   if (updates.permissions) {
//     const io = req.app.get('io');
//     if (io) {
//       io.to(`role:${roleId}`).emit('permissions:updated', {
//         type: 'role',
//         roleId: String(role._id),
//         permissions: role.permissions,
//         timestamp: new Date().toISOString()
//       });
//     }
//   }
//   // ADD THIS ↑
  
//   res.status(200).json({ status: 'success', message: 'Role updated', data: { role } });

// });

// exports.deleteRole = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const roleId = req.params.id;

//   const role = await Role.findOne({ _id: roleId, organizationId: orgId });
//   if (!role) return next(new AppError("Role not found", 404));

//   if (role.isSuperAdmin && !req.user.isOwner)
//     return next(new AppError("Only owners can delete super admin roles", 403));

//   const count = await User.countDocuments({ organizationId: orgId, role: roleId });
//   if (count > 0)
//     return next(new AppError(`Cannot delete — ${count} user(s) still assigned this role`, 400));

//   await Role.findByIdAndDelete(roleId);
//   res.status(200).json({ status: "success", message: "Role deleted", data: null });
// });

// exports.getAvailablePermissions = catchAsync(async (req, res) => {
//   const sensitiveGroups = ["System", "Organization", "Platform"];
//   const list = (req.user.isOwner || req.user.isSuperAdmin)
//     ? PERMISSIONS_LIST
//     : PERMISSIONS_LIST.filter(p => !sensitiveGroups.includes(p.group));

//   const groups = [...new Set(list.map(p => p.group))];
//   const grouped = list.reduce((acc, p) => {
//     (acc[p.group] ??= []).push({ tag: p.tag, description: p.description });
//     return acc;
//   }, {});

//   res.status(200).json({
//     status: "success",
//     data: { groups, groupedPermissions: grouped, total: list.length, canManageSensitive: req.user.isOwner || req.user.isSuperAdmin },
//   });
// });

// exports.assignRoleToUser = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { userId, roleId } = req.body;

//   if (!userId || !roleId) return next(new AppError("userId and roleId are required", 400));

//   // Parallel fetch — user + role at the same time
//   const [targetUser, role] = await Promise.all([
//     User.findOne({ _id: userId, organizationId: orgId }),
//     Role.findOne({ _id: roleId, organizationId: orgId }),
//   ]);

//   if (!targetUser) return next(new AppError("User not found in your organization", 404));
//   if (!role) return next(new AppError("Role not found in your organization", 404));

//   if (role.isSuperAdmin && !req.user.isOwner)
//     return next(new AppError("Only owners can assign super admin roles", 403));

//   targetUser.role = roleId;
//   await targetUser.save();

//   res.status(200).json({
//     status: "success",
//     message: "Role assigned",
//     data: {
//       user: { id: targetUser._id, name: targetUser.name, email: targetUser.email },
//       role: { id: role._id, name: role.name },
//     },
//   });
// });
