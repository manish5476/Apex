const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const Organization = require('../models/organizationModel');
const Role = require('../models/roleModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { signToken } = require('../utils/authUtils');

/**
 * @desc    Employee signs up under an organization
 * @route   POST /api/v1/auth/signup
 * @access  Public
 */
exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, uniqueShopId } = req.body;

  // 1. Find the organization using the uniqueShopId
  const organization = await Organization.findOne({ uniqueShopId });
  if (!organization) {
    return next(new AppError('No organization found with this Shop ID.', 404));
  }

  // 2. Create the new user with 'pending' status
  const newUser = await User.create({
    name,
    email,
    password,
    passwordConfirm, // Assuming you have a validator in the model
    organizationId: organization._id,
    status: 'pending', // IMPORTANT: User must be approved
    // 'role' and 'branchId' will be set upon approval
  });

  // 3. Add user to the organization's approval queue
  organization.approvalRequests.push(newUser._id);
  await organization.save();

  // 4. Send response
  res.status(201).json({
    status: 'success',
    message: 'Signup successful! Your account is pending approval from the admin.',
  });
});

/**
 * @desc    User (Owner, Admin, Employee) logs in
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1. Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password!', 400));
  }

  // 2. Find the user
  const user = await User.findOne({ email }).select('+password');

  // 3. Check if user exists, password is correct, and user is approved
  if (
    !user ||
    !(await user.correctPassword(password, user.password)) ||
    user.status !== 'approved'
  ) {
    if (user && user.status === 'pending') {
      return next(
        new AppError('Your account is still pending approval.', 401)
      );
    }
    return next(new AppError('Incorrect email or password', 401));
  }

  // 4. If everything is ok, send token to client
  const token = signToken(user);
  
  user.password = undefined; // Don't send password back

  res.status(200).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
});

/**
 * @desc    Protect routes: verify token and load user
 * @access  Middleware
 */
exports.protect = catchAsync(async (req, res, next) => {
  // 1. Get token and check if it exists
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }

  // 2. Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3. Check if user still exists
  const currentUser = await User.findById(decoded.id).populate('role');
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to this token no longer exists.',
        401
      )
    );
  }

  // 4. Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401)
    );
  }
  
  // 5. Check if user is active
  if (currentUser.status !== 'approved') {
    return next(
        new AppError('This user account is not active.', 401)
    );
  }

  // 6. Grant access: Attach user, orgId, and permissions to the request
  req.user = currentUser;
  req.user.organizationId = currentUser.organizationId; // For factory
  req.user.branchId = currentUser.branchId; // For factory
  
  // Attach permissions for restrictTo (from the populated role)
  if (currentUser.role && currentUser.role.permissions) {
    req.user.permissions = currentUser.role.permissions;
  } else {
    req.user.permissions = [];
  }
  
  next();
});

/**
 * @desc    Restrict routes to certain roles (using permissions)
 * @access  Middleware
 */
exports.restrictTo = (...permissions) => {
  return (req, res, next) => {
    // 1. Check if user has a role and permissions
    if (!req.user || !req.user.permissions) {
      return next(
        new AppError('You do not have permission to perform this action.', 403)
      );
    }
    
    // 2. Check for 'superadmin' string
    // This is for the 'restrictTo('superadmin')' check
    if (permissions.includes('superadmin') && req.user.role?.isSuperAdmin) {
      return next(); // Super Admin gets immediate access
    }
    
    // 3. Check for 'platform-admin' (if you have one)
    if (permissions.includes('platform-admin') && req.user.role?.name === 'Platform Admin') {
      return next(); // Platform Admin gets access
    }

    // 4. Check if user's permissions array contains any of the required permissions
    const hasPermission = permissions.some((permission) =>
      req.user.permissions.includes(permission)
    );

    if (!hasPermission) {
      return next(
        new AppError('You do not have permission to perform this in `authController`.', 403)
      );
    }

    next();
  };
};

// ... (You will add password reset functions here later) ...
// exports.forgotPassword = ...
// exports.resetPassword = ...