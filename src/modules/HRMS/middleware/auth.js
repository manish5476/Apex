// middleware/auth.js
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
// const User = require('../models/user.model');
const AttendanceMachine = require('../models/attendanceMachine.model');
const User = require('../../auth/core/user.model');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const factory = require('../../../core/utils/api/handlerFactory');

exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) { return next(new AppError('You are not logged in. Please log in to access this resource.', 401)); }
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).select('+isLoginBlocked +loginAttempts +lockUntil');
  if (!user) { return next(new AppError('The user belonging to this token no longer exists.', 401)); }
  if (user.isLoginBlocked) {
    return next(new AppError('Your account has been blocked. Please contact administrator.', 403));
  }

  if (!user.isActive || user.status !== 'approved') {
    return next(new AppError('Your account is not active. Please contact administrator.', 403));
  }
  req.user = user;
  next();
});

// Restrict to certain roles
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user.role?.name || '';
    const isSuperAdmin = req.user.isSuperAdmin;
    const isOwner = req.user.isOwner;
    if (isSuperAdmin || isOwner) {
      return next();
    }
    if (!roles.includes(userRole)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

// Machine API key authentication
exports.machineAuth = catchAsync(async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const machineId = req.params.id || req.body.machineId;
  if (!apiKey || !machineId) {
    return next(new AppError('Please provide machine ID and API key', 401));
  }
  const machine = await AttendanceMachine.findById(machineId).select('+apiKey');
  if (!machine) {
    return next(new AppError('Machine not found', 401));
  }
  const isValid = await machine.verifyApiKey(apiKey);
  if (!isValid) {
    return next(new AppError('Invalid API key', 401));
  }
  if (machine.status !== 'active') {
    return next(new AppError('Machine is not active', 403));
  }
  req.attendanceMachine = machine;
  next();
});