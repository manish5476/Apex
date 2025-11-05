const Branch = require('../models/branchModel');
const Organization = require('../models/organizationModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');

/* -------------------------------------------------------------
 * Create a new branch under current user's organization
------------------------------------------------------------- */
exports.createBranch = catchAsync(async (req, res, next) => {
  const { name, address } = req.body;

  if (!name || !address) {
    return next(new AppError('Branch name and address are required', 400));
  }

  // Ensure user belongs to an organization
  if (!req.user.organizationId) {
    return next(new AppError('You must belong to an organization to create a branch', 403));
  }

  // Create branch scoped to organization
  const branch = await Branch.create({
    name,
    address,
    organizationId: req.user.organizationId,
    createdBy: req.user._id,
  });

  // Add this branch to organization’s branches array
  await Organization.findByIdAndUpdate(
    req.user.organizationId,
    { $push: { branches: branch._id } },
    { new: true }
  );

  res.status(201).json({
    status: 'success',
    message: 'Branch created successfully!',
    data: { branch },
  });
});

/* -------------------------------------------------------------
 * Get all branches for logged-in user's organization
------------------------------------------------------------- */
exports.getAllBranches = factory.getAll(Branch);

/* -------------------------------------------------------------
 * Get one branch (scoped by organization)
------------------------------------------------------------- */
exports.getBranch = factory.getOne(Branch);

/* -------------------------------------------------------------
 * Update branch (name/address/phone)
------------------------------------------------------------- */
exports.updateBranch = factory.updateOne(Branch);

/* -------------------------------------------------------------
 * Delete branch (soft delete if supported)
------------------------------------------------------------- */
exports.deleteBranch = factory.deleteOne(Branch);

/* -------------------------------------------------------------
 * Get all branches for current user's org (custom)
 * (used by dropdowns or invoice creation screens)
------------------------------------------------------------- */
exports.getMyBranches = catchAsync(async (req, res, next) => {
  const branches = await Branch.find({
    organizationId: req.user.organizationId,
    isDeleted: { $ne: true },
  });

  res.status(200).json({
    status: 'success',
    results: branches.length,
    data: { branches },
  });
});


// const Branch = require('../models/branchModel');
// const factory = require('../utils/handlerFactory');
// /**
//  * @desc    Create a new branch
//  * @route   POST /api/v1/branches
//  * @access  Private (Admin, Superadmin)
//  * @note    Factory's 'createOne' auto-adds orgId, createdBy
//  */
// exports.createBranch = factory.createOne(Branch);

// /**
//  * @desc    Get all branches for the organization
//  * @route   GET /api/v1/branches
//  * @access  Private (All approved users)
//  * @note    Factory's 'getAll' auto-filters by orgId
//  */
// exports.getAllBranches = factory.getAll(Branch);

// /**
//  * @desc    Get a single branch by ID
//  * @route   GET /api/v1/branches/:id
//  * @access  Private (All approved users)
//  * @note    Factory's 'getOne' auto-checks orgId
//  */
// exports.getBranch = factory.getOne(Branch, { path: 'managerId', select: 'name email' });

// /**
//  * @desc    Update a branch
//  * @route   PATCH /api/v1/branches/:id
//  * @access  Private (Admin, Superadmin)
//  * @note    Factory's 'updateOne' auto-checks orgId
//  */
// exports.updateBranch = factory.updateOne(Branch);

// /**
//  * @desc    Delete a branch (soft delete)
//  * @route   DELETE /api/v1/branches/:id
//  * @access  Private (Admin, Superadmin)
//  * @note    Factory's 'deleteOne' auto-checks orgId and handles soft delete
//  */
// exports.deleteBranch = factory.deleteOne(Branch);

// /**
//  * @desc    Restore a soft-deleted branch
//  * @route   PATCH /api/v1/branches/:id/restore
//  * @access  Private (Admin, Superadmin)
//  */
// exports.restoreBranch = factory.restoreOne(Branch);