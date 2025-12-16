const mongoose = require('mongoose');
const crypto = require('crypto');
const Organization = require('../models/organizationModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const sendEmail = require('../utils/email');
const { signToken } = require('../utils/authUtils');
const { emitToOrg, emitToUser } = require('../utils/socket'); // ✅ IMPORTED SOCKET UTILITIES
/* -------------------------------------------------------------
 * Utility: Generate Unique Shop ID (Fallback)
------------------------------------------------------------- */
const generateUniqueShopId = () =>
  `ORG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/* -------------------------------------------------------------
 * Create New Organization (Transactional)
------------------------------------------------------------- */
exports.createOrganization = catchAsync(async (req, res, next) => {
  const { organizationName, uniqueShopId, primaryEmail, primaryPhone, gstNumber, ownerName, ownerEmail, ownerPassword, mainBranchName, mainBranchAddress,} = req.body;
  
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

    // Step 2: Create Role (Super Admin)
    const newRole = await new Role({
      name: 'Super Admin',
      organizationId: tempOrgId,
      permissions: Role.allPermissions || [], 
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
    newOrg.members.push(newUser._id); // Add owner to members

    newUser.organizationId = newOrg._id;
    newUser.branchId = newBranch._id;
    newUser.role = newRole._id;

    await Promise.all([newOrg.save({ session }), newUser.save({ session })]);
    await session.commitTransaction();
    
    // Fetch clean data for response
    const orgId = newOrg._id;
    const [branches, roles] = await Promise.all([
      Branch.find({ organizationId: orgId, isActive: true }).select('_id name address isMainBranch').lean(),
      Role.find({ organizationId: orgId }).select('_id name permissions isSuperAdmin isDefault').lean()
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
 * Get Pending Members
------------------------------------------------------------- */
exports.getPendingMembers = catchAsync(async (req, res, next) => {
  if (!req.user.organizationId) {
    return next(new AppError('Not authorized to view pending members', 403));
  }

  // Directly query Users with status='pending' linked to this Org
  const pendingMembers = await User.find({
    organizationId: req.user.organizationId,
    status: 'pending'
  })
  .select('name email phone createdAt status avatar')
  .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: pendingMembers.length,
    data: {
      pendingMembers
    }
  });
});

/* -------------------------------------------------------------
 * Approve Member
------------------------------------------------------------- */
exports.approveMember = catchAsync(async (req, res, next) => {
  const { userId, roleId, branchId } = req.body;

  if (!userId || !roleId || !branchId)
    return next(new AppError("Missing required fields: userId, roleId, branchId", 400));

  const org = await Organization.findById(req.user.organizationId);
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
    // 1. Update User
    user.status = "approved";
    user.role = roleId;
    user.branchId = branchId;

    // 2. Add to Org Members (if not exists)
    if (!org.members.includes(user._id)) {
      org.members.push(user._id);
    }

    // ❌ REMOVED: Old 'approvalRequests' array logic (Prevents Crash)

    await Promise.all([
      user.save({ session }),
      org.save({ session })
    ]);

    await session.commitTransaction();

    // 3. Prepare Safe Response (Inject Permissions for UI)
    const userResponse = user.toObject();
    userResponse.permissions = role.permissions || [];
    userResponse.role = role;

    // 4. Send Real-time Notification to Org Admins
    if (typeof emitToOrg === "function") {
      emitToOrg(req.user.organizationId, "newNotification", {
        title: "Member Approved",
        message: `${user.name} has been approved.`,
        type: "success",
        createdAt: new Date()
      });
    }

    // 5. Send Email Notification to User (Async - don't await)
    try {
      sendEmail({
        email: user.email,
        subject: "Account Approved",
        message: `Congratulations ${user.name}, your account for ${org.name} has been approved. You can now log in.`,
      });
    } catch (emailErr) {
      console.error("Failed to send approval email:", emailErr.message);
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
 * Reject Member (With Email & Socket Notification)
------------------------------------------------------------- */
exports.rejectMember = catchAsync(async (req, res, next) => {
  const { userId } = req.body;
  if (!userId) {
    return next(new AppError("User ID is required", 400));
  }
  const user = await User.findOne({
    _id: userId,
    organizationId: req.user.organizationId,
    status: "pending"
  });

  if (!user) {
    return next(new AppError("Pending request not found.", 404));
  }

  const userEmail = user.email;
  const userName = user.name;
  const orgName = req.user.organizationName || "the organization"; // You might want to fetch Org Name if not in req.user

  // 2. Send Notifications BEFORE Deletion
  // We do this first because once deleted, the user object is gone.
  
  // A. Socket Notification (If user happens to be connected with a temporary socket)
  if (typeof emitToUser === "function") {
    emitToUser(user._id, "accountRejected", {
      message: "Your request to join the organization was declined.",
      reason: "Admin decision"
    });
  }

  // B. Email Notification
  try {
    await sendEmail({
      email: userEmail,
      subject: "Membership Request Declined",
      message: `Hello ${userName},\n\nYour request to join ${orgName} has been declined by the administrator.\n\nIf you believe this is an error, please contact the administration directly.`,
    });
  } catch (emailErr) {
    console.error(`Failed to send rejection email to ${userEmail}:`, emailErr.message);
    // We continue with deletion even if email fails
  }

  // 3. Action: Delete the user document
  // Since they were only 'pending', we remove the record entirely so they can signup again if needed.
  await User.deleteOne({ _id: user._id });

  // 4. Notify Admins (Real-time update to remove from list)
  if (typeof emitToOrg === "function") {
    emitToOrg(req.user.organizationId, "memberRejected", {
      userId: userId,
      message: `Request for ${userName} was rejected.`
    });
  }

  res.status(200).json({
    status: "success",
    message: "Membership request rejected and user record removed."
  });
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




// const mongoose = require('mongoose');
// const crypto = require('crypto');
// const Organization = require('../models/organizationModel');
// const Branch = require('../models/branchModel');
// const User = require('../models/userModel');
// const Role = require('../models/roleModel');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');
// const factory = require('../utils/handlerFactory');
// const { signToken } = require('../utils/authUtils');
// const { emitToOrg } = require('../utils/socket');
// // Assuming you have a permissions config, if not, verify where 'Role.allPermissions' comes from.
// // const { ALL_PERMISSIONS } = require('../config/permissions'); 

// /* -------------------------------------------------------------
//  * Utility: Generate Unique Shop ID (Fallback)
// ------------------------------------------------------------- */
// const generateUniqueShopId = () =>
//   `ORG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// /* -------------------------------------------------------------
//  * Create New Organization (Transactional)
// ------------------------------------------------------------- */
// exports.createOrganization = catchAsync(async (req, res, next) => {
//   const {
//     organizationName,
//     uniqueShopId,
//     primaryEmail,
//     primaryPhone,
//     gstNumber,
//     ownerName,
//     ownerEmail,
//     ownerPassword,
//     mainBranchName,
//     mainBranchAddress,
//   } = req.body;
   
//   if (!organizationName || !ownerName || !ownerEmail || !ownerPassword)
//     return next(new AppError('Missing required organization or owner fields', 400));

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const tempOrgId = new mongoose.Types.ObjectId();

//     // Step 1: Create the Owner (Approved by default as they are the creator)
//     const newUser = await new User({
//       name: ownerName,
//       email: ownerEmail,
//       password: ownerPassword,
//       organizationId: tempOrgId,
//       status: 'approved',
//     }).save({ session });

//     // Step 2: Create Super Admin Role
//     // Ensure Role.allPermissions is defined in your Role model or import it from config
//     const newRole = await new Role({
//       name: 'Super Admin',
//       organizationId: tempOrgId,
//       permissions: Role.allPermissions || [], // Fallback to empty array if undefined
//       isSuperAdmin: true,
//     }).save({ session });

//     // Step 3: Create Organization
//     const newOrg = await new Organization({
//       _id: tempOrgId,
//       name: organizationName,
//       uniqueShopId: uniqueShopId || generateUniqueShopId(),
//       primaryEmail,
//       primaryPhone,
//       gstNumber,
//       owner: newUser._id,
//     }).save({ session });

//     // Step 4: Create Main Branch
//     const newBranch = await new Branch({
//       name: mainBranchName || 'Main Branch',
//       address: mainBranchAddress,
//       organizationId: newOrg._id,
//       isMainBranch: true,
//     }).save({ session });

//     // Step 5: Link Everything
//     newOrg.mainBranch = newBranch._id;
//     newOrg.branches.push(newBranch._id);
//     // Add owner to members list
//     newOrg.members.push(newUser._id);

//     newUser.organizationId = newOrg._id;
//     newUser.branchId = newBranch._id;
//     newUser.role = newRole._id;

//     await Promise.all([newOrg.save({ session }), newUser.save({ session })]);
//     await session.commitTransaction();
    
//     // Fetch fresh data for response
//     const orgId = newOrg._id;
//     const [branches, roles] = await Promise.all([
//       Branch.find({ organizationId: orgId, isActive: true }).select('_id name address isMainBranch').lean(),
//       Role.find({ organizationId: orgId }).select('_id name permissions isSuperAdmin isDefault').lean()
//     ]);

//     const token = signToken(newUser);
//     newUser.password = undefined;

//     res.status(201).json({
//       status: 'success',
//       message: 'Organization created successfully!',
//       token,
//       allbranches: branches,
//       allroles: roles,
//       data: { organization: newOrg, owner: newUser, branch: newBranch, role: newRole },
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     if (err.code === 11000) {
//       if (err.keyPattern?.uniqueShopId)
//         return next(new AppError('This Shop ID is already taken.', 400));
//       if (err.keyPattern?.email)
//         return next(new AppError('This email address is already in use.', 400));
//     }
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* -------------------------------------------------------------
//  * Get Pending Members
//  * Combined logic to fetch all pending users for the org
// ------------------------------------------------------------- */
// exports.getPendingMembers = catchAsync(async (req, res, next) => {
//   // Security: Ensure the requesting user belongs to the organization
//   if (!req.user.organizationId) {
//     return next(new AppError('User not linked to an organization', 403));
//   }

//   const pendingMembers = await User.find({
//     organizationId: req.user.organizationId,
//     status: 'pending'
//   })
//   .select('name email phone createdAt status avatar')
//   .sort({ createdAt: -1 });

//   res.status(200).json({
//     status: 'success',
//     results: pendingMembers.length,
//     data: {
//       pendingMembers
//     }
//   });
// });

// /* -------------------------------------------------------------
//  * Approve Member
//  * FIXED: Removed 'approvalRequests' array logic to prevent crashes
// ------------------------------------------------------------- */
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
//     // 1. Update user status and links
//     user.status = "approved";
//     user.role = roleId;
//     user.branchId = branchId;

//     // 2. Add to Org Members list (if not already there)
//     // Note: We use $addToSet in a direct update or check specifically to avoid duplicates
//     if (!org.members.includes(user._id)) {
//       org.members.push(user._id);
//     }

//     // ❌ DELETED: Logic regarding org.approvalRequests 
//     // This field was removed from the model to improve performance/security.
    
//     await Promise.all([
//       user.save({ session }),
//       org.save({ session })
//     ]);

//     await session.commitTransaction();

//     // 3. Prepare Response Data
//     const userResponse = user.toObject();
//     userResponse.permissions = role.permissions || [];
//     userResponse.role = role; 

//     // 4. Send Real-time Notification
//     if (typeof emitToOrg === "function") {
//       // Notify the organization admins
//       emitToOrg(req.user.organizationId, "newNotification", {
//         title: "Member Approved",
//         message: `${user.name} has been approved.`,
//         type: "success",
//         createdAt: new Date()
//       });
      
//       // Optional: You might want to emit a specific event to the user effectively logging them in if they are waiting
//       // emitToUser(user._id, "accountApproved", { ... });
//     }

//     res.status(200).json({
//       status: "success",
//       message: "Member approved successfully",
//       data: { user: userResponse }
//     });

//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* -------------------------------------------------------------
//  * Reject Member
//  * Logic: Deletes the pending user document (or marks as rejected)
// ------------------------------------------------------------- */
// exports.rejectMember = catchAsync(async (req, res, next) => {
//   const { userId } = req.body;

//   if (!userId) {
//     return next(new AppError("User ID is required", 400));
//   }

//   // 1. Find the pending user to ensure they belong to this org
//   const user = await User.findOne({
//     _id: userId,
//     organizationId: req.user.organizationId,
//     status: "pending"
//   });

//   if (!user) {
//     return next(new AppError("Pending request not found.", 404));
//   }

//   // 2. Action: Delete the user document (Cleanest for 'pending' signups)
//   await User.deleteOne({ _id: user._id });

//   // OR: If you want to keep a record, update status instead:
//   // user.status = 'rejected';
//   // await user.save();

//   // 3. Optional: Send Email/Socket notification to the user saying they were rejected
//   // ...

//   res.status(200).json({
//     status: "success",
//     message: "Membership request rejected."
//   });
// });

// /* -------------------------------------------------------------
//  * Self-service organization endpoints
// ------------------------------------------------------------- */
// exports.getMyOrganization = catchAsync(async (req, res, next) => {
//   if (!req.user.organizationId) {
//     return next(new AppError('This user is not linked to any organization.', 400));
//   }

//   const org = await Organization.findById(req.user.organizationId)
//     .populate({ path: 'owner', select: 'name email' })
//     .populate({ path: 'members', select: 'name email role status' })
//     .populate({ path: 'branches', select: 'name city state' });

//   if (!org) {
//     return next(new AppError('Organization not found (ID mismatch).', 404));
//   }

//   res.status(200).json({
//     status: 'success',
//     data: org 
//   });
// });

// exports.updateMyOrganization = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;

//   if (!orgId) {
//     return next(new AppError("You are not linked to any organization.", 400));
//   }

//   // Prevent member/owner hijacking
//   if (req.body.owner) {
//     return next(new AppError("You cannot change the organization owner.", 403));
//   }

//   const allowedFields = [
//     "name", "primaryEmail", "primaryPhone", "gstNumber",
//     "uniqueShopId", "address", "city", "state", "country", "pincode"
//   ];

//   const updates = {};
//   Object.keys(req.body).forEach((key) => {
//     if (allowedFields.includes(key)) updates[key] = req.body[key];
//   });

//   if (Object.keys(updates).length === 0) {
//     return next(new AppError("No valid fields provided for update.", 400));
//   }

//   const updatedOrg = await Organization.findByIdAndUpdate(
//     orgId,
//     updates,
//     { new: true, runValidators: true }
//   );

//   if (!updatedOrg) {
//     return next(new AppError("Organization not found.", 404));
//   }

//   res.status(200).json({
//     status: "success",
//     message: "Organization updated successfully.",
//     data: updatedOrg
//   });
// });

// exports.deleteMyOrganization = catchAsync(async (req, res, next) => {
//   const org = await Organization.findById(req.user.organizationId);
//   if (!org) return next(new AppError('Organization not found.', 404));
  
//   if (org.owner.toString() !== req.user.id)
//     return next(new AppError('Only the owner can delete this organization.', 403));
    
//   // Pass the ID specifically to the handler factory
//   req.params.id = req.user.organizationId;
//   return factory.deleteOne(Organization)(req, res, next);
// });

// /* -------------------------------------------------------------
//  * Platform-admin CRUD (Protected by Restricted Middleware)
// ------------------------------------------------------------- */
// exports.getAllOrganizations = factory.getAll(Organization);
// exports.getOrganization = factory.getOne(Organization, [
//   { path: 'owner', select: 'name email' },
//   { path: 'members', select: 'name email role' },
//   { path: 'branches', select: 'name city state' },
// ]);

// exports.updateOrganization = factory.updateOne(Organization);
// exports.deleteOrganization = factory.deleteOne(Organization);




// // const mongoose = require('mongoose');
// // const crypto = require('crypto');
// // const Organization = require('../models/organizationModel');
// // const Branch = require('../models/branchModel');
// // const User = require('../models/userModel');
// // const Role = require('../models/roleModel');
// // const catchAsync = require('../utils/catchAsync');
// // const AppError = require('../utils/appError');
// // const factory = require('../utils/handlerFactory');
// // const { signToken } = require('../utils/authUtils');
// // const { emitToOrg } = require('../utils/socket'); 

// // /* -------------------------------------------------------------
// //  * Utility: Generate Unique Shop ID (Fallback)
// // ------------------------------------------------------------- */
// // const generateUniqueShopId = () =>
// //   `ORG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// // /* -------------------------------------------------------------
// //  * Create New Organization (Transactional)
// // ------------------------------------------------------------- */
// // exports.createOrganization = catchAsync(async (req, res, next) => {
// //   const {
// //     organizationName,
// //     uniqueShopId,
// //     primaryEmail,
// //     primaryPhone,
// //     gstNumber,
// //     ownerName,
// //     ownerEmail,
// //     ownerPassword,
// //     mainBranchName,
// //     mainBranchAddress,
// //   } = req.body;
  
// //   if (!organizationName || !ownerName || !ownerEmail || !ownerPassword)
// //     return next(new AppError('Missing required organization or owner fields', 400));

// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     const tempOrgId = new mongoose.Types.ObjectId();

// //     // Step 1: Create the Owner
// //     const newUser = await new User({
// //       name: ownerName,
// //       email: ownerEmail,
// //       password: ownerPassword,
// //       organizationId: tempOrgId,
// //       status: 'approved',
// //     }).save({ session });

// //     // Step 2: Create Role
// //     const newRole = await new Role({
// //       name: 'Super Admin',
// //       organizationId: tempOrgId,
// //       permissions: Role.allPermissions,
// //       isSuperAdmin: true,
// //     }).save({ session });

// //     // Step 3: Create Organization
// //     const newOrg = await new Organization({
// //       _id: tempOrgId,
// //       name: organizationName,
// //       uniqueShopId: uniqueShopId || generateUniqueShopId(),
// //       primaryEmail,
// //       primaryPhone,
// //       gstNumber,
// //       owner: newUser._id,
// //     }).save({ session });

// //     // Step 4: Create Main Branch
// //     const newBranch = await new Branch({
// //       name: mainBranchName || 'Main Branch',
// //       address: mainBranchAddress,
// //       organizationId: newOrg._id,
// //       isMainBranch: true,
// //     }).save({ session });

// //     // Step 5: Link Everything
// //     newOrg.mainBranch = newBranch._id;
// //     newOrg.branches.push(newBranch._id);
// //     newUser.organizationId = newOrg._id;
// //     newUser.branchId = newBranch._id;
// //     newUser.role = newRole._id;

// //     await Promise.all([newOrg.save({ session }), newUser.save({ session })]);
// //     await session.commitTransaction();
    
// //     const orgId = newOrg._id;
// //     const [branches, roles] = await Promise.all([
// //       require('../models/branchModel').find({ organizationId: orgId, isActive: true }).select('_id name address isMainBranch').lean(),
// //       require('../models/roleModel').find({ organizationId: orgId }).select('_id name permissions isSuperAdmin isDefault').lean()
// //     ]);

// //     const token = signToken(newUser);
// //     newUser.password = undefined;

// //     res.status(201).json({
// //       status: 'success',
// //       message: 'Organization created successfully!',
// //       token,
// //       allbranches: branches,
// //       allroles: roles,
// //       data: { organization: newOrg, owner: newUser, branch: newBranch, role: newRole },
// //     });
// //   } catch (err) {
// //     await session.abortTransaction();
// //     if (err.code === 11000) {
// //       if (err.keyPattern?.uniqueShopId)
// //         return next(new AppError('This Shop ID is already taken.', 400));
// //       if (err.keyPattern?.email)
// //         return next(new AppError('This email address is already in use.', 400));
// //     }
// //     next(err);
// //   } finally {
// //     session.endSession();
// //   }
// // });

// // exports.getPendingRequests = catchAsync(async (req, res, next) => {
// //   // Find all users belonging to this org who are pending
// //   const requests = await User.find({
// //     organizationId: req.user.organizationId,
// //     status: 'pending'
// //   }).select('name email createdAt avatar'); // Select only what you need

// //   res.status(200).json({
// //     status: 'success',
// //     results: requests.length,
// //     data: { requests }
// //   });
// // });

// // /* -------------------------------------------------------------
// //  * Get Pending Members (Fixed: Returns Full User Data)
// // ------------------------------------------------------------- */
// // exports.getPendingMembers = catchAsync(async (req, res, next) => {
// //   // 1. Verify the requester is the owner
// //   const org = await Organization.findOne({
// //     _id: req.user.organizationId,
// //     owner: req.user.id
// //   });

// //   if (!org) {
// //     return next(new AppError('Not authorized to view pending members', 403));
// //   }

// //   // 2. Query the USER collection directly
// //   // This avoids issues with the 'approvalRequests' array structure mismatch.
// //   // It guarantees we get all users who are linked to this Org and are 'pending'.
// //   const pendingMembers = await User.find({
// //     organizationId: req.user.organizationId,
// //     status: 'pending'
// //   })
// //   .select('name email phone createdAt status') // Select fields you want to display
// //   .sort({ createdAt: -1 }); // Show newest first

// //   res.status(200).json({
// //     status: 'success',
// //     results: pendingMembers.length,
// //     data: {
// //       pendingMembers
// //     }
// //   });
// // });

// // /* -------------------------------------------------------------
// //  * Approve Member (Requires userId, roleId, branchId)
// // ------------------------------------------------------------- */
// // // exports.approveMember = catchAsync(async (req, res, next) => {
// // //   const { userId, roleId, branchId } = req.body;

// // //   if (!userId || !roleId || !branchId)
// // //     return next(new AppError("Missing required fields: userId, roleId, branchId", 400));

// // //   const org = await Organization.findOne({ _id: req.user.organizationId });
// // //   if (!org) return next(new AppError("Organization not found.", 404));

// // //   // Find pending user
// // //   const user = await User.findOne({
// // //     _id: userId,
// // //     organizationId: req.user.organizationId,
// // //     status: "pending",
// // //   });

// // //   if (!user) return next(new AppError("User is not pending or doesn't exist.", 404));

// // //   // Validate role & branch
// // //   const role = await Role.findOne({ _id: roleId, organizationId: req.user.organizationId });
// // //   if (!role) return next(new AppError("Invalid role ID.", 400));

// // //   const branch = await Branch.findOne({ _id: branchId, organizationId: req.user.organizationId });
// // //   if (!branch) return next(new AppError("Invalid branch ID.", 400));

// // //   const session = await mongoose.startSession();
// // //   session.startTransaction();

// // //   try {
// // //     // 1. Update user
// // //     user.status = "approved";
// // //     user.role = roleId;
// // //     user.branchId = branchId;

// // //     // 2. Update Org Members
// // //     if (!org.members.includes(user._id)) {
// // //       org.members.push(user._id);
// // //     }

// // //     // 3. Remove from approvalRequests (Handle both Object and ID cases safely)
// // //     // Since we are now pushing just IDs in Auth Controller, we use .pull() or filter by ID.
// // //     // This filter is robust: checks if item is an ID or an Object with .userId
// // //     org.approvalRequests = org.approvalRequests.filter(item => {
// // //       const itemId = item.userId ? item.userId.toString() : item.toString();
// // //       return itemId !== userId.toString();
// // //     });

// // //     await Promise.all([
// // //       user.save({ session }),
// // //       org.save({ session })
// // //     ]);

// // //     await session.commitTransaction();

// // //     // 4. Send Real-time Notification
// // //     if (typeof emitToOrg === "function") {
// // //       emitToOrg(req.user.organizationId, "newNotification", {
// // //         title: "Member Approved",
// // //         message: `${user.name} has been approved.`,
// // //         type: "success",
// // //         createdAt: new Date()
// // //       });
// // //     }

// // //     res.status(200).json({
// // //       status: "success",
// // //       message: "Member approved successfully",
// // //       data: { user }
// // //     });

// // //   } catch (err) {
// // //     await session.abortTransaction();
// // //     next(err);
// // //   } finally {
// // //     session.endSession();
// // //   }
// // // });
// // /* -------------------------------------------------------------
// //  * Approve Member (Requires userId, roleId, branchId)
// // ------------------------------------------------------------- */
// // exports.approveMember = catchAsync(async (req, res, next) => {
// //   const { userId, roleId, branchId } = req.body;

// //   if (!userId || !roleId || !branchId)
// //     return next(new AppError("Missing required fields: userId, roleId, branchId", 400));

// //   const org = await Organization.findOne({ _id: req.user.organizationId });
// //   if (!org) return next(new AppError("Organization not found.", 404));

// //   // Find pending user
// //   const user = await User.findOne({
// //     _id: userId,
// //     organizationId: req.user.organizationId,
// //     status: "pending",
// //   });

// //   if (!user) return next(new AppError("User is not pending or doesn't exist.", 404));

// //   // Validate role & branch
// //   const role = await Role.findOne({ _id: roleId, organizationId: req.user.organizationId });
// //   if (!role) return next(new AppError("Invalid role ID.", 400));

// //   const branch = await Branch.findOne({ _id: branchId, organizationId: req.user.organizationId });
// //   if (!branch) return next(new AppError("Invalid branch ID.", 400));

// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     // 1. Update user
// //     user.status = "approved";
// //     user.role = roleId;
// //     user.branchId = branchId;
// //     // We do NOT save permissions array on user DB model to avoid de-sync. 
// //     // We rely on population or manual injection in response.

// //     // 2. Update Org Members
// //     if (!org.members.includes(user._id)) {
// //       org.members.push(user._id);
// //     }

// //     // 3. Remove from approvalRequests
// //     org.approvalRequests = org.approvalRequests.filter(item => {
// //       const itemId = item.userId ? item.userId.toString() : item.toString();
// //       return itemId !== userId.toString();
// //     });

// //     await Promise.all([
// //       user.save({ session }),
// //       org.save({ session })
// //     ]);

// //     await session.commitTransaction();

// //     // 4. Prepare Response Data (Flatten permissions for UI)
// //     // We manually construct the response object to include permissions from the Role we just fetched
// //     const userResponse = user.toObject();
// //     userResponse.permissions = role.permissions || []; // ✅ HERE: Inject permissions for UI
// //     userResponse.role = role; // Embed full role object for context

// //     // 5. Send Real-time Notification
// //     if (typeof emitToOrg === "function") {
// //       emitToOrg(req.user.organizationId, "newNotification", {
// //         title: "Member Approved",
// //         message: `${user.name} has been approved.`,
// //         type: "success",
// //         createdAt: new Date()
// //       });
// //     }

// //     res.status(200).json({
// //       status: "success",
// //       message: "Member approved successfully",
// //       data: { user: userResponse }
// //     });

// //   } catch (err) {
// //     await session.abortTransaction();
// //     next(err);
// //   } finally {
// //     session.endSession();
// //   }
// // });

// // /* -------------------------------------------------------------
// //  * Self-service organization endpoints
// // ------------------------------------------------------------- */
// // exports.getMyOrganization = catchAsync(async (req, res, next) => {
// //   if (!req.user.organizationId) {
// //     return next(new AppError('This user is not linked to any organization.', 400));
// //   }

// //   const org = await Organization.findById(req.user.organizationId)
// //     .populate({ path: 'owner', select: 'name email' })
// //     .populate({ path: 'members', select: 'name email role status' })
// //     .populate({ path: 'branches', select: 'name city state' });

// //   if (!org) {
// //     return next(new AppError('Organization not found (ID mismatch).', 404));
// //   }

// //   res.status(200).json({
// //     status: 'success',
// //     data: org 
// //   });
// // });

// // exports.updateMyOrganization = catchAsync(async (req, res, next) => {
// //   const orgId = req.user.organizationId;

// //   if (!orgId) {
// //     return next(new AppError("You are not linked to any organization.", 400));
// //   }

// //   if (req.body.owner) {
// //     return next(new AppError("You cannot change the organization owner.", 403));
// //   }

// //   const allowedFields = [
// //     "name", "primaryEmail", "primaryPhone", "gstNumber",
// //     "uniqueShopId", "address", "city", "state", "country", "pincode"
// //   ];

// //   const updates = {};
// //   Object.keys(req.body).forEach((key) => {
// //     if (allowedFields.includes(key)) updates[key] = req.body[key];
// //   });

// //   if (Object.keys(updates).length === 0) {
// //     return next(new AppError("No valid fields provided for update.", 400));
// //   }

// //   const updatedOrg = await Organization.findByIdAndUpdate(
// //     orgId,
// //     updates,
// //     { new: true, runValidators: true }
// //   );

// //   if (!updatedOrg) {
// //     return next(new AppError("Organization not found.", 404));
// //   }

// //   res.status(200).json({
// //     status: "success",
// //     message: "Organization updated successfully.",
// //     data: updatedOrg
// //   });
// // });

// // exports.deleteMyOrganization = catchAsync(async (req, res, next) => {
// //   const org = await Organization.findById(req.user.organizationId);
// //   if (!org) return next(new AppError('Organization not found.', 404));
// //   if (org.owner.toString() !== req.user.id)
// //     return next(new AppError('Only the owner can delete this organization.', 403));
// //   req.params.id = req.user.organizationId;
// //   return factory.deleteOne(Organization)(req, res, next);
// // });

// // /* -------------------------------------------------------------
// //  * Platform-admin CRUD
// // ------------------------------------------------------------- */
// // exports.getAllOrganizations = factory.getAll(Organization);
// // exports.getOrganization = factory.getOne(Organization, [
// //   { path: 'owner', select: 'name email' },
// //   { path: 'members', select: 'name email role' },
// //   { path: 'branches', select: 'name city state' },
// // ]);

// // exports.updateOrganization = factory.updateOne(Organization);
// // exports.deleteOrganization = factory.deleteOne(Organization);

