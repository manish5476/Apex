const Role = require("./role.model");
const User = require("./user.model");
const Organization = require("../../organization/core/organization.model");
const catchAsync = require("../../../core/utils/api/catchAsync");
const AppError = require("../../../core/utils/api/appError");
const { VALID_TAGS, PERMISSIONS_LIST } = require("../../../config/permissions");

// ─── NO canManageRoles() — middleware already guaranteed this ──────────────

exports.createRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { name, permissions = [], isDefault = false, isSuperAdmin = false } = req.body;

  if (!name) return next(new AppError("Role name required", 400));

  // Only owners can create super-admin roles
  if (isSuperAdmin && !req.user.isOwner) {
    return next(new AppError("Only organization owners can create super admin roles", 403));
  }

  const invalid = permissions.filter(p => !VALID_TAGS.includes(p));
  if (invalid.length) return next(new AppError(`Invalid permissions: ${invalid.join(", ")}`, 400));

  const exists = await Role.exists({
    organizationId: orgId,
    name: { $regex: new RegExp(`^${name}$`, "i") },
  });
  if (exists) return next(new AppError("Role name already exists in your organization", 400));

  const role = await Role.create({
    name,
    organizationId: orgId,
    permissions,
    isDefault,
    isSuperAdmin,
    createdBy: req.user._id,
  });

  res.status(201).json({ status: "success", message: "Role created", data: { role } });
});

exports.getRoles = catchAsync(async (req, res) => {
  const orgId = req.user.organizationId;
  const query = { organizationId: orgId };
  if (!req.user.isOwner && !req.user.isSuperAdmin) query.isSuperAdmin = false;

  const roles = await Role.find(query).sort({ isSuperAdmin: -1, isDefault: -1, name: 1 });
  res.status(200).json({ status: "success", results: roles.length, data: { roles } });
});

exports.getRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const query = { _id: req.params.id, organizationId: orgId };
  if (!req.user.isOwner && !req.user.isSuperAdmin) query.isSuperAdmin = false;

  const role = await Role.findOne(query);
  if (!role) return next(new AppError("Role not found", 404));

  const users = await User.find({ organizationId: orgId, role: req.params.id })
    .select("name email status branchId");

  res.status(200).json({
    status: "success",
    data: { role, assignedUsers: users, userCount: users.length },
  });
});

exports.updateRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const roleId = req.params.id;
  const updates = req.body;

  const existing = await Role.findOne({ _id: roleId, organizationId: orgId });
  if (!existing) return next(new AppError("Role not found", 404));

  if (existing.isSuperAdmin && !req.user.isOwner)
    return next(new AppError("Only owners can modify super admin roles", 403));

  if (updates.isSuperAdmin && !req.user.isOwner)
    return next(new AppError("Only owners can promote a role to super admin", 403));

  if (updates.permissions) {
    const invalid = updates.permissions.filter(p => !VALID_TAGS.includes(p));
    if (invalid.length) return next(new AppError(`Invalid permissions: ${invalid.join(", ")}`, 400));
  }

  if (updates.name && updates.name !== existing.name) {
    const clash = await Role.exists({
      organizationId: orgId,
      name: { $regex: new RegExp(`^${updates.name}$`, "i") },
      _id: { $ne: roleId },
    });
    if (clash) return next(new AppError("Another role with this name already exists", 400));
  }

  const role = await Role.findOneAndUpdate(
    { _id: roleId, organizationId: orgId },
    updates,
    { new: true, runValidators: true }
  );
  
  // ADD THIS ↓
  if (updates.permissions) {
    const io = req.app.get('io');
    if (io) {
      io.to(`role:${roleId}`).emit('permissions:updated', {
        type: 'role',
        roleId: String(role._id),
        permissions: role.permissions,
        timestamp: new Date().toISOString()
      });
    }
  }
  // ADD THIS ↑
  
  res.status(200).json({ status: 'success', message: 'Role updated', data: { role } });

});

exports.deleteRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const roleId = req.params.id;

  const role = await Role.findOne({ _id: roleId, organizationId: orgId });
  if (!role) return next(new AppError("Role not found", 404));

  if (role.isSuperAdmin && !req.user.isOwner)
    return next(new AppError("Only owners can delete super admin roles", 403));

  const count = await User.countDocuments({ organizationId: orgId, role: roleId });
  if (count > 0)
    return next(new AppError(`Cannot delete — ${count} user(s) still assigned this role`, 400));

  await Role.findByIdAndDelete(roleId);
  res.status(200).json({ status: "success", message: "Role deleted", data: null });
});

exports.getAvailablePermissions = catchAsync(async (req, res) => {
  const sensitiveGroups = ["System", "Organization", "Platform"];
  const list = (req.user.isOwner || req.user.isSuperAdmin)
    ? PERMISSIONS_LIST
    : PERMISSIONS_LIST.filter(p => !sensitiveGroups.includes(p.group));

  const groups = [...new Set(list.map(p => p.group))];
  const grouped = list.reduce((acc, p) => {
    (acc[p.group] ??= []).push({ tag: p.tag, description: p.description });
    return acc;
  }, {});

  res.status(200).json({
    status: "success",
    data: { groups, groupedPermissions: grouped, total: list.length, canManageSensitive: req.user.isOwner || req.user.isSuperAdmin },
  });
});

exports.assignRoleToUser = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { userId, roleId } = req.body;

  if (!userId || !roleId) return next(new AppError("userId and roleId are required", 400));

  // Parallel fetch — user + role at the same time
  const [targetUser, role] = await Promise.all([
    User.findOne({ _id: userId, organizationId: orgId }),
    Role.findOne({ _id: roleId, organizationId: orgId }),
  ]);

  if (!targetUser) return next(new AppError("User not found in your organization", 404));
  if (!role) return next(new AppError("Role not found in your organization", 404));

  if (role.isSuperAdmin && !req.user.isOwner)
    return next(new AppError("Only owners can assign super admin roles", 403));

  targetUser.role = roleId;
  await targetUser.save();

  res.status(200).json({
    status: "success",
    message: "Role assigned",
    data: {
      user: { id: targetUser._id, name: targetUser.name, email: targetUser.email },
      role: { id: role._id, name: role.name },
    },
  });
});
