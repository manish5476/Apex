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
const { emitToOrg } = require('../utils/socket'); 

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
    const [branches, roles] = await Promise.all([
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
 * Get Pending Members (Fixed: Returns Full User Data)
------------------------------------------------------------- */
exports.getPendingMembers = catchAsync(async (req, res, next) => {
  // 1. Verify the requester is the owner
  const org = await Organization.findOne({
    _id: req.user.organizationId,
    owner: req.user.id
  });

  if (!org) {
    return next(new AppError('Not authorized to view pending members', 403));
  }

  // 2. Query the USER collection directly
  // This avoids issues with the 'approvalRequests' array structure mismatch.
  // It guarantees we get all users who are linked to this Org and are 'pending'.
  const pendingMembers = await User.find({
    organizationId: req.user.organizationId,
    status: 'pending'
  })
  .select('name email phone createdAt status') // Select fields you want to display
  .sort({ createdAt: -1 }); // Show newest first

  res.status(200).json({
    status: 'success',
    results: pendingMembers.length,
    data: {
      pendingMembers
    }
  });
});

/* -------------------------------------------------------------
 * Approve Member (Requires userId, roleId, branchId)
------------------------------------------------------------- */
// exports.approveMember = catchAsync(async (req, res, next) => {
//   const { userId, roleId, branchId } = req.body;

//   if (!userId || !roleId || !branchId)
//     return next(new AppError("Missing required fields: userId, roleId, branchId", 400));

//   const org = await Organization.findOne({ _id: req.user.organizationId });
//   if (!org) return next(new AppError("Organization not found.", 404));

//   // Find pending user
//   const user = await User.findOne({
//     _id: userId,
//     organizationId: req.user.organizationId,
//     status: "pending",
//   });

//   if (!user) return next(new AppError("User is not pending or doesn't exist.", 404));

//   // Validate role & branch
//   const role = await Role.findOne({ _id: roleId, organizationId: req.user.organizationId });
//   if (!role) return next(new AppError("Invalid role ID.", 400));

//   const branch = await Branch.findOne({ _id: branchId, organizationId: req.user.organizationId });
//   if (!branch) return next(new AppError("Invalid branch ID.", 400));

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // 1. Update user
//     user.status = "approved";
//     user.role = roleId;
//     user.branchId = branchId;

//     // 2. Update Org Members
//     if (!org.members.includes(user._id)) {
//       org.members.push(user._id);
//     }

//     // 3. Remove from approvalRequests (Handle both Object and ID cases safely)
//     // Since we are now pushing just IDs in Auth Controller, we use .pull() or filter by ID.
//     // This filter is robust: checks if item is an ID or an Object with .userId
//     org.approvalRequests = org.approvalRequests.filter(item => {
//       const itemId = item.userId ? item.userId.toString() : item.toString();
//       return itemId !== userId.toString();
//     });

//     await Promise.all([
//       user.save({ session }),
//       org.save({ session })
//     ]);

//     await session.commitTransaction();

//     // 4. Send Real-time Notification
//     if (typeof emitToOrg === "function") {
//       emitToOrg(req.user.organizationId, "newNotification", {
//         title: "Member Approved",
//         message: `${user.name} has been approved.`,
//         type: "success",
//         createdAt: new Date()
//       });
//     }

//     res.status(200).json({
//       status: "success",
//       message: "Member approved successfully",
//       data: { user }
//     });

//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });
/* -------------------------------------------------------------
 * Approve Member (Requires userId, roleId, branchId)
------------------------------------------------------------- */
exports.approveMember = catchAsync(async (req, res, next) => {
  const { userId, roleId, branchId } = req.body;

  if (!userId || !roleId || !branchId)
    return next(new AppError("Missing required fields: userId, roleId, branchId", 400));

  const org = await Organization.findOne({ _id: req.user.organizationId });
  if (!org) return next(new AppError("Organization not found.", 404));

  // Find pending user
  const user = await User.findOne({
    _id: userId,
    organizationId: req.user.organizationId,
    status: "pending",
  });

  if (!user) return next(new AppError("User is not pending or doesn't exist.", 404));

  // Validate role & branch
  const role = await Role.findOne({ _id: roleId, organizationId: req.user.organizationId });
  if (!role) return next(new AppError("Invalid role ID.", 400));

  const branch = await Branch.findOne({ _id: branchId, organizationId: req.user.organizationId });
  if (!branch) return next(new AppError("Invalid branch ID.", 400));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Update user
    user.status = "approved";
    user.role = roleId;
    user.branchId = branchId;
    // We do NOT save permissions array on user DB model to avoid de-sync. 
    // We rely on population or manual injection in response.

    // 2. Update Org Members
    if (!org.members.includes(user._id)) {
      org.members.push(user._id);
    }

    // 3. Remove from approvalRequests
    org.approvalRequests = org.approvalRequests.filter(item => {
      const itemId = item.userId ? item.userId.toString() : item.toString();
      return itemId !== userId.toString();
    });

    await Promise.all([
      user.save({ session }),
      org.save({ session })
    ]);

    await session.commitTransaction();

    // 4. Prepare Response Data (Flatten permissions for UI)
    // We manually construct the response object to include permissions from the Role we just fetched
    const userResponse = user.toObject();
    userResponse.permissions = role.permissions || []; // ✅ HERE: Inject permissions for UI
    userResponse.role = role; // Embed full role object for context

    // 5. Send Real-time Notification
    if (typeof emitToOrg === "function") {
      emitToOrg(req.user.organizationId, "newNotification", {
        title: "Member Approved",
        message: `${user.name} has been approved.`,
        type: "success",
        createdAt: new Date()
      });
    }

    res.status(200).json({
      status: "success",
      message: "Member approved successfully",
      data: { user: userResponse }
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
exports.getMyOrganization = catchAsync(async (req, res, next) => {
  if (!req.user.organizationId) {
    return next(new AppError('This user is not linked to any organization.', 400));
  }

  const org = await Organization.findById(req.user.organizationId)
    .populate({ path: 'owner', select: 'name email' })
    .populate({ path: 'members', select: 'name email role status' })
    .populate({ path: 'branches', select: 'name city state' });

  if (!org) {
    return next(new AppError('Organization not found (ID mismatch).', 404));
  }

  res.status(200).json({
    status: 'success',
    data: org 
  });
});

exports.updateMyOrganization = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;

  if (!orgId) {
    return next(new AppError("You are not linked to any organization.", 400));
  }

  if (req.body.owner) {
    return next(new AppError("You cannot change the organization owner.", 403));
  }

  const allowedFields = [
    "name", "primaryEmail", "primaryPhone", "gstNumber",
    "uniqueShopId", "address", "city", "state", "country", "pincode"
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

