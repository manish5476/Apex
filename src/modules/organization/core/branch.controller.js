const mongoose = require('mongoose');
const Branch = require('./branch.model');
const Organization = require('./organization.model');
const User = require('../../auth/core/user.model');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const factory = require('../../../core/utils/api/handlerFactory');

// ======================================================
// GET ALL BRANCHES (platform admin — all orgs)
// GET /branches
// ======================================================
exports.getAllBranches = factory.getAll(Branch, {
  searchFields: ['name', 'branchCode', 'phoneNumber', 'address.city', 'address.state'],
  populate: [
    { path: 'managerId',     select: 'name email' },
    { path: 'organizationId', select: 'name' },
  ],
});

// ======================================================
// GET MY BRANCHES (scoped to req.user.organizationId)
// GET /branches/my-branches
// ======================================================
// NOTE: Relies on factory.getAll automatically injecting
// { organizationId: req.user.organizationId } into the query filter.
// Verify your handlerFactory does this — if not, use a custom handler.
exports.getMyBranches = factory.getAll(Branch, {
  fields: 'name branchCode isActive isMainBranch address',
  searchFields: ['name', 'branchCode'],
});

// ======================================================
// GET ONE BRANCH
// GET /branches/:id
// ======================================================
exports.getBranch = factory.getOne(Branch, {
  populate: [
    { path: 'managerId',     select: 'name email' },
    { path: 'organizationId', select: 'name' },
  ],
});

// ======================================================
// CREATE BRANCH
// POST /branches
// ======================================================
exports.createBranch = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;

  // Validate managerId belongs to this org (if provided)
  if (req.body.managerId) {
    const manager = await User.findOne({
      _id: req.body.managerId,
      organizationId: orgId,
      isActive: true,
    });
    if (!manager)
      return next(new AppError('Manager not found in this organization.', 400));
  }

  req.body.organizationId = orgId;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // If this is the new main branch, demote all others atomically
    if (req.body.isMainBranch) {
      await Branch.updateMany(
        { organizationId: orgId },
        { $set: { isMainBranch: false } },
        { session }
      );
    }

    const [branch] = await Branch.create([req.body], { session });

    // Keep Organization.branches[] cache in sync
    await Organization.findByIdAndUpdate(
      orgId,
      { $addToSet: { branches: branch._id } },
      { session }
    );

    await session.commitTransaction();

    res.status(201).json({
      status: 'success',
      data: { data: branch },
    });

  } catch (err) {
    await session.abortTransaction();

    if (err.code === 11000)
      return next(new AppError('A branch with this code already exists in your organization.', 400));

    next(err);
  } finally {
    session.endSession();
  }
});

// ======================================================
// UPDATE BRANCH
// PATCH /branches/:id
// ======================================================
exports.updateBranch = catchAsync(async (req, res, next) => {
  const orgId    = req.user.organizationId;
  const branchId = req.params.id;

  // Validate managerId belongs to this org (if being changed)
  if (req.body.managerId) {
    const manager = await User.findOne({
      _id: req.body.managerId,
      organizationId: orgId,
      isActive: true,
    });
    if (!manager)
      return next(new AppError('Manager not found in this organization.', 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Atomically demote other main branches before promoting this one
    if (req.body.isMainBranch) {
      await Branch.updateMany(
        { organizationId: orgId, _id: { $ne: branchId } },
        { $set: { isMainBranch: false } },
        { session }
      );
    }

    const branch = await Branch.findOneAndUpdate(
      { _id: branchId, organizationId: orgId },
      { $set: req.body },
      { new: true, runValidators: true, session }
    );

    if (!branch) {
      await session.abortTransaction();
      return next(new AppError('Branch not found.', 404));
    }

    await session.commitTransaction();

    res.status(200).json({
      status: 'success',
      data: { data: branch },
    });

  } catch (err) {
    await session.abortTransaction();

    if (err.code === 11000)
      return next(new AppError('A branch with this code already exists in your organization.', 400));

    next(err);
  } finally {
    session.endSession();
  }
});

// ======================================================
// DELETE BRANCH (safe soft delete)
// DELETE /branches/:id
// ======================================================
exports.deleteBranch = catchAsync(async (req, res, next) => {
  const orgId    = req.user.organizationId;
  const branchId = req.params.id;

  const branch = await Branch.findOne({ _id: branchId, organizationId: orgId });
  if (!branch) return next(new AppError('Branch not found.', 404));

  // 1. Cannot delete the main branch
  if (branch.isMainBranch)
    return next(new AppError(
      'Cannot delete the main branch. Set another branch as main first.',
      400
    ));

  // 2. Cannot delete if staff are still assigned to this branch
  const staffCount = await User.countDocuments({
    branchId: branchId,
    isActive: true,
  });
  if (staffCount > 0)
    return next(new AppError(
      `Cannot delete: ${staffCount} active staff member(s) are assigned to this branch. Reassign them first.`,
      409
    ));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Soft delete the branch
    branch.isDeleted = true;
    branch.isActive  = false;
    await branch.save({ session });

    // Remove from Organization.branches[] cache
    await Organization.findByIdAndUpdate(
      orgId,
      { $pull: { branches: branchId } },
      { session }
    );

    await session.commitTransaction();

    res.status(200).json({
      status: 'success',
      message: 'Branch deleted successfully.',
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});



// // src/controllers/branchController.js
// const Branch = require('./branch.model');
// const Organization = require('./organization.model');
// const catchAsync = require('../../../core/utils/api/catchAsync');
// const factory = require('../../../core/utils/api/handlerFactory');

// // // GET /branches
// exports.getAllBranches = factory.getAll(Branch, {
//   searchFields: ['name', 'branchCode', 'phoneNumber', 'address.city', 'address.state'],
//   populate: [
//     { path: 'managerId', select: 'name email' },
//     { path: 'organizationId', select: 'name' }
//   ]
// });

// /* -------------------------------------------------------------
//    Get All EMIs
// ------------------------------------------------------------- */

// // GET /branches/my
// exports.getMyBranches = factory.getAll(Branch, {
//   fields: 'name branchCode isActive',
//   searchFields: ['name', 'branchCode']
// });

// // GET /branches/:id
// exports.getBranch = factory.getOne(Branch, {
//   populate: [
//     { path: 'managerId', select: 'name email' },
//     { path: 'organizationId', select: 'name' }
//   ]
// });

// // POST /branches
// exports.createBranch = catchAsync(async (req, res, next) => {
//   req.body.organizationId = req.user.organizationId;

//   // if new branch = main, demote others
//   if (req.body.isMainBranch) {
//     await Branch.updateMany(
//       { organizationId: req.user.organizationId },
//       { $set: { isMainBranch: false } }
//     );
//   }

//   const branch = await Branch.create(req.body);

//   await Organization.findByIdAndUpdate(req.user.organizationId, {
//     $addToSet: { branches: branch._id }
//   });

//   res.status(201).json({
//     status: 'success',
//     data: { data: branch }
//   });
// });

// // PATCH /branches/:id
// exports.updateBranch = catchAsync(async (req, res, next) => {
//   if (req.body.isMainBranch) {
//     await Branch.updateMany(
//       { organizationId: req.user.organizationId },
//       { $set: { isMainBranch: false } }
//     );
//   }

//   return factory.updateOne(Branch)(req, res, next);
// });

// // DELETE /branches/:id  (soft by default)
// exports.deleteBranch = factory.deleteOne(Branch);
