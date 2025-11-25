const mongoose = require('mongoose');
const crypto = require('crypto');
const Organization = require('../models/organizationModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const { signToken } = require('../utils/authUtils');

/* -------------------------------------------------------------
 * Utility: Generate Unique Shop ID (Fallback)
------------------------------------------------------------- */
const generateUniqueShopId = () =>
  `ORG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/* -------------------------------------------------------------
 * Create New Organization (Transactional)
------------------------------------------------------------- */
exports.createOrganization = catchAsync(async (req, res, next) => {
  const {
    organizationName,
    uniqueShopId,
    primaryEmail,
    primaryPhone,
    gstNumber,
    ownerName,
    ownerEmail,
    ownerPassword,
    mainBranchName,
    mainBranchAddress,
  } = req.body;
  if (!organizationName || !ownerName || !ownerEmail || !ownerPassword)
    return next(new AppError('Missing required organization or owner fields', 400));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tempOrgId = new mongoose.Types.ObjectId();

    // Step 1: Create the Owner
    const newUser = await new User({
      name: ownerName,
      email: ownerEmail,
      password: ownerPassword,
      organizationId: tempOrgId,
      status: 'approved',
    }).save({ session });

    // Step 2: Create Role
    const newRole = await new Role({
      name: 'Super Admin',
      organizationId: tempOrgId,
      permissions: Role.allPermissions,
      isSuperAdmin: true,
    }).save({ session });

    // Step 3: Create Organization
    const newOrg = await new Organization({
      _id: tempOrgId,
      name: organizationName,
      uniqueShopId: uniqueShopId || generateUniqueShopId(),
      primaryEmail,
      primaryPhone,
      gstNumber,
      owner: newUser._id,
    }).save({ session });

    // Step 4: Create Main Branch
    const newBranch = await new Branch({
      name: mainBranchName || 'Main Branch',
      address: mainBranchAddress,
      organizationId: newOrg._id,
      isMainBranch: true,
    }).save({ session });

    // Step 5: Link Everything
    newOrg.mainBranch = newBranch._id;
    newOrg.branches.push(newBranch._id);
    newUser.organizationId = newOrg._id;
    newUser.branchId = newBranch._id;
    newUser.role = newRole._id;

    await Promise.all([newOrg.save({ session }), newUser.save({ session })]);
    await session.commitTransaction();
    const orgId = newOrg._id;

    // fetch branches and roles for the org
    const [branches, roles] = await Promise.all([
      // limit fields to only what's needed for UI
      require('../models/branchModel').find({ organizationId: orgId, isActive: true }).select('_id name address isMainBranch').lean(),
      require('../models/roleModel').find({ organizationId: orgId }).select('_id name permissions isSuperAdmin isDefault').lean()
    ]);

    const token = signToken(newUser);
    newUser.password = undefined;

    res.status(201).json({
      status: 'success',
      message: 'Organization created successfully!',
      token,
      allbranches: branches,
      allroles: roles,
      data: { organization: newOrg, owner: newUser, branch: newBranch, role: newRole },
    });
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000) {
      if (err.keyPattern?.uniqueShopId)
        return next(new AppError('This Shop ID is already taken.', 400));
      if (err.keyPattern?.email)
        return next(new AppError('This email address is already in use.', 400));
    }
    next(err);
  } finally {
    session.endSession();
  }
});


/* -------------------------------------------------------------
 * Pending Member (Requires userId, roleId, branchId)
------------------------------------------------------------- */
exports.getPendingMembers = catchAsync(async (req, res, next) => {
  const org = await Organization.findOne({
    _id: req.user.organizationId,
    owner: req.user.id,
  }).populate({
    path: 'approvalRequests',
    select: 'name email createdAt',
  });

  if (!org) {
    return next(new AppError('You are not authorized to view this data', 403));
  }

  res.status(200).json({
    status: 'success',
    results: org.approvalRequests.length,
    data: {
      pendingMembers: org.approvalRequests,
    },
  });
});


/* -------------------------------------------------------------
 * Approve Member (Requires userId, roleId, branchId)
------------------------------------------------------------- */
exports.approveMember = catchAsync(async (req, res, next) => {
  const { userId, roleId, branchId } = req.body;
  if (!userId || !roleId || !branchId)
    return next(new AppError('Please provide userId, roleId, and branchId', 400));

  const org = await Organization.findOne({
    _id: req.user.organizationId,
    owner: req.user.id,
  });
  if (!org) return next(new AppError('Not authorized', 403));

  const user = await User.findOne({
    _id: userId,
    organizationId: req.user.organizationId,
    status: 'pending',
  });
  if (!user) return next(new AppError('No pending user found', 404));

  const [role, branch] = await Promise.all([
    Role.findOne({ _id: roleId, organizationId: req.user.organizationId }),
    Branch.findOne({ _id: branchId, organizationId: req.user.organizationId }),
  ]);
  if (!role || !branch) return next(new AppError('Invalid Role or Branch', 400));

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    user.status = 'approved';
    user.role = roleId;
    user.branchId = branchId;
    await user.save({ session });
    org.members.push(userId);
    org.approvalRequests.pull(userId);
    await org.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      status: 'success',
      message: 'Member approved successfully',
      data: { user },
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

/* -------------------------------------------------------------
 * Self-service organization endpoints
------------------------------------------------------------- */
// exports.getMyOrganization = catchAsync(async (req, res, next) => {
//   req.params.id = req.user.organizationId;
//   return factory.getOne(Organization, [
//     { path: 'owner', select: 'name email' },
//     { path: 'members', select: 'name email role' },
//     { path: 'branches', select: 'name city state' },
//   ])(req, res, next);
// });
exports.getMyOrganization = catchAsync(async (req, res, next) => {
  // 1. Safety Check
  if (!req.user.organizationId) {
    return next(new AppError('This user is not linked to any organization.', 400));
  }

  // 2. Direct Query (Instead of factory.getOne)
  const org = await Organization.findById(req.user.organizationId)
    .populate({ path: 'owner', select: 'name email' })
    .populate({ path: 'members', select: 'name email role status' }) // Ensure 'status' is selected
    .populate({ path: 'branches', select: 'name city state' });

  if (!org) {
    return next(new AppError('Organization not found (ID mismatch).', 404));
  }

  res.status(200).json({
    status: 'success',
    data: org // Note: factory returns { data: { data: org } }, this returns { data: org }
  });
});

exports.updateMyOrganization = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;

  if (!orgId) {
    return next(new AppError("You are not linked to any organization.", 400));
  }

  // Block owner overrides
  if (req.body.owner) {
    return next(new AppError("You cannot change the organization owner.", 403));
  }

  // Allow only editable fields
  const allowedFields = [
    "name",
    "primaryEmail",
    "primaryPhone",
    "gstNumber",
    "uniqueShopId",
    "address",
    "city",
    "state",
    "country",
    "pincode"
  ];

  const updates = {};
  Object.keys(req.body).forEach((key) => {
    if (allowedFields.includes(key)) updates[key] = req.body[key];
  });

  if (Object.keys(updates).length === 0) {
    return next(new AppError("No valid fields provided for update.", 400));
  }

  const updatedOrg = await Organization.findByIdAndUpdate(
    orgId,
    updates,
    { new: true, runValidators: true }
  );

  if (!updatedOrg) {
    return next(new AppError("Organization not found.", 404));
  }

  res.status(200).json({
    status: "success",
    message: "Organization updated successfully.",
    data: updatedOrg
  });
});

exports.deleteMyOrganization = catchAsync(async (req, res, next) => {
  const org = await Organization.findById(req.user.organizationId);
  if (!org) return next(new AppError('Organization not found.', 404));
  if (org.owner.toString() !== req.user.id)
    return next(new AppError('Only the owner can delete this organization.', 403));
  req.params.id = req.user.organizationId;
  return factory.deleteOne(Organization)(req, res, next);
});

/* -------------------------------------------------------------
 * Platform-admin CRUD
------------------------------------------------------------- */
exports.getAllOrganizations = factory.getAll(Organization);
exports.getOrganization = factory.getOne(Organization, [
  { path: 'owner', select: 'name email' },
  { path: 'members', select: 'name email role' },
  { path: 'branches', select: 'name city state' },
]);

exports.updateOrganization = factory.updateOne(Organization);
exports.deleteOrganization = factory.deleteOne(Organization);







// exports.updateMyOrganization = catchAsync(async (req, res, next) => {
//   if (req.body.owner)
//     return next(new AppError('You cannot change the organization owner.', 403));
//   req.params.id = req.user.organizationId;
//   return factory.updateOne(Organization)(req, res, next);
// });
