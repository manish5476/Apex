// src/controllers/branchController.js
const Branch = require('../models/branchModel');
const Organization = require('../models/organizationModel');
const catchAsync = require('../utils/catchAsync');
const factory = require('../utils/handlerFactory');

// GET /branches
exports.getAllBranches = factory.getAll(Branch, {
  searchFields: ['name', 'branchCode', 'phoneNumber', 'address.city', 'address.state'],
  populate: [
    { path: 'managerId', select: 'name email' },
    { path: 'organizationId', select: 'name' }
  ]
});

// GET /branches/my
exports.getMyBranches = factory.getAll(Branch, {
  fields: 'name branchCode isActive',
  searchFields: ['name', 'branchCode']
});

// GET /branches/:id
exports.getBranch = factory.getOne(Branch, {
  populate: [
    { path: 'managerId', select: 'name email' },
    { path: 'organizationId', select: 'name' }
  ]
});

// POST /branches
exports.createBranch = catchAsync(async (req, res, next) => {
  req.body.organizationId = req.user.organizationId;

  // if new branch = main, demote others
  if (req.body.isMainBranch) {
    await Branch.updateMany(
      { organizationId: req.user.organizationId },
      { $set: { isMainBranch: false } }
    );
  }

  const branch = await Branch.create(req.body);

  await Organization.findByIdAndUpdate(req.user.organizationId, {
    $addToSet: { branches: branch._id }
  });

  res.status(201).json({
    status: 'success',
    data: { data: branch }
  });
});

// PATCH /branches/:id
exports.updateBranch = catchAsync(async (req, res, next) => {
  if (req.body.isMainBranch) {
    await Branch.updateMany(
      { organizationId: req.user.organizationId },
      { $set: { isMainBranch: false } }
    );
  }

  return factory.updateOne(Branch)(req, res, next);
});

// DELETE /branches/:id  (soft by default)
exports.deleteBranch = factory.deleteOne(Branch);

// const Branch = require('../models/branchModel');
// const Organization = require('../models/organizationModel');
// const catchAsync = require('../utils/catchAsync');
// const factory = require('./handlerFactory');

// /* -------------------------------------------------------------
//    GET ALL BRANCHES (The Fix)
// ------------------------------------------------------------- */
// exports.getAllBranches = factory.getAll(Branch, {
//   // 1. Explicitly define fields that actually exist in BranchModel
//   searchFields: ['name', 'branchCode', 'phoneNumber', 'address.city'],
//   // 2. Populate manager instead of generic createdBy (which isn't in your Branch schema)
//   populate: [
//     { path: 'managerId', select: 'name email' },
//     { path: 'organizationId', select: 'name' }
//   ]
// });

// /* -------------------------------------------------------------
//    CREATE BRANCH (Atomic Sync)
// ------------------------------------------------------------- */
// exports.createBranch = catchAsync(async (req, res, next) => {
//   // Inject organizationId from user token
//   req.body.organizationId = req.user.organizationId;

//   const branch = await Branch.create(req.body);

//   // Link to Organization
//   await Organization.findByIdAndUpdate(req.user.organizationId, {
//     $push: { branches: branch._id }
//   });

//   res.status(201).json({
//     status: 'success',
//     data: { data: branch }
//   });
// });

// exports.getBranch = factory.getOne(Branch, { populate: 'managerId' });
// exports.updateBranch = factory.updateOne(Branch);
// exports.deleteBranch = factory.deleteOne(Branch);

// // Dropdown optimized version
// exports.getMyBranches = factory.getAll(Branch, {
//   fields: 'name branchCode isActive' // limitFields() will handle this
// });
// // const Branch = require('../models/branchModel');
// // const Organization = require('../models/organizationModel');
// // const catchAsync = require('../utils/catchAsync');
// // const AppError = require('../utils/appError');
// // const factory = require('../utils/handlerFactory');

// // /* -------------------------------------------------------------
// //  * Create a new branch under current user's organization
// // ------------------------------------------------------------- */
// // exports.createBranch = catchAsync(async (req, res, next) => {
// //   const { name, address } = req.body;

// //   if (!name || !address) {
// //     return next(new AppError('Branch name and address are required', 400));
// //   }

// //   // Ensure user belongs to an organization
// //   if (!req.user.organizationId) {
// //     return next(new AppError('You must belong to an organization to create a branch', 403));
// //   }

// //   // Create branch scoped to organization
// //   const branch = await Branch.create({
// //     name,
// //     address,
// //     organizationId: req.user.organizationId,
// //     createdBy: req.user._id,
// //   });

// //   // Add this branch to organization’s branches array
// //   await Organization.findByIdAndUpdate(
// //     req.user.organizationId,
// //     { $push: { branches: branch._id } },
// //     { new: true }
// //   );

// //   res.status(201).json({
// //     status: 'success',
// //     message: 'Branch created successfully!',
// //     data: { branch },
// //   });
// // });

// // /* -------------------------------------------------------------
// //  * Get all branches for logged-in user's organization
// // ------------------------------------------------------------- */
// // exports.getAllBranches = factory.getAll(Branch);

// // /* -------------------------------------------------------------
// //  * Get one branch (scoped by organization)
// // ------------------------------------------------------------- */
// // exports.getBranch = factory.getOne(Branch);

// // /* -------------------------------------------------------------
// //  * Update branch (name/address/phone)
// // ------------------------------------------------------------- */
// // exports.updateBranch = factory.updateOne(Branch);

// // /* -------------------------------------------------------------
// //  * Delete branch (soft delete if supported)
// // ------------------------------------------------------------- */
// // exports.deleteBranch = factory.deleteOne(Branch);

// // /* -------------------------------------------------------------
// //  * Get all branches for current user's org (custom)
// //  * (used by dropdowns or invoice creation screens)
// // ------------------------------------------------------------- */
// // exports.getMyBranches = catchAsync(async (req, res, next) => {
// //   const branches = await Branch.find({
// //     organizationId: req.user.organizationId,
// //     isDeleted: { $ne: true },
// //   });

// //   res.status(200).json({
// //     status: 'success',
// //     results: branches.length,
// //     data: { branches },
// //   });
// // });
