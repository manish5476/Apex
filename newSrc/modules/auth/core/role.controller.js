// controllers/roleController.js
const Role = require('../models/roleModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Create a role
exports.createRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { name, permissions = [], isDefault = false, isSuperAdmin = false } = req.body;
  if (!name) return next(new AppError('Role name required', 400));
  const role = await Role.create({
    name,
    organizationId: orgId,
    permissions,
    isDefault,
    isSuperAdmin
  });

  res.status(201).json({ status: 'success', data: { role } });
});

// Get all roles for org
exports.getRoles = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const roles = await Role.find({ organizationId: orgId }).sort({ isSuperAdmin: -1, name: 1 });
  res.status(200).json({ status: 'success', results: roles.length, data: { roles } });
});

// Update role
exports.updateRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const roleId = req.params.id;
  const updates = req.body;
  const role = await Role.findOneAndUpdate({ _id: roleId, organizationId: orgId }, updates, { new: true });
  if (!role) return next(new AppError('Role not found', 404));
  res.status(200).json({ status: 'success', data: { role } });
});

// Delete role
exports.deleteRole = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const roleId = req.params.id;
  const role = await Role.findOneAndDelete({ _id: roleId, organizationId: orgId });
  if (!role) return next(new AppError('Role not found', 404));
  res.status(204).json({ status: 'success', data: null });
});
