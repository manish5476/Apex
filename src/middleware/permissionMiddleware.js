const AppError = require('../utils/appError');
const Role = require('../models/roleModel'); // Ensure path is correct

exports.checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    // 1. Check if Auth Middleware ran
    if (!req.user) {
      return next(new AppError('Not authenticated. Please login.', 401));
    }

    // 2. Load Role (if not already loaded by protect middleware)
    // Optimization: Assuming req.user.role is an ObjectId, we might need to fetch it
    let role = req.user.roleDetails; // Suppose protect() populates this
    
    if (!role && req.user.role) {
       role = await Role.findById(req.user.role);
    }

    if (!role) {
      return next(new AppError('Role not found for this user.', 403));
    }

    // 3. SUPER ADMIN BYPASS
    if (role.isSuperAdmin) {
      return next();
    }

    // 4. Check Tag
    if (!role.permissions.includes(requiredPermission)) {
      return next(new AppError(`Access Denied. Required permission: ${requiredPermission}`, 403));
    }

    next();
  };
};