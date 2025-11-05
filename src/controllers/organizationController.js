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

    const token = signToken(newUser);
    newUser.password = undefined;

    res.status(201).json({
      status: 'success',
      message: 'Organization created successfully!',
      token,
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
exports.getMyOrganization = catchAsync(async (req, res, next) => {
  req.params.id = req.user.organizationId;
  return factory.getOne(Organization, [
    { path: 'owner', select: 'name email' },
    { path: 'members', select: 'name email role' },
    { path: 'branches', select: 'name city state' },
  ])(req, res, next);
});

exports.updateMyOrganization = catchAsync(async (req, res, next) => {
  if (req.body.owner)
    return next(new AppError('You cannot change the organization owner.', 403));
  req.params.id = req.user.organizationId;
  return factory.updateOne(Organization)(req, res, next);
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


// latstone from gemini
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

// /* -------------------------------------------------------------
//  * Utility: Generate Unique Shop ID (Fallback)
// ------------------------------------------------------------- */
// const generateUniqueShopId = () => {
//   return `ORG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
// };

// /* -------------------------------------------------------------
//  * Create New Organization (Transactional)
//  * This is the master "Sign Up" function.
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
//     mainBranchAddress, // { street, city, state, zipCode }
//   } = req.body;

//   // Start transaction
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // --- Step 1: Create the Owner User (temporary orgId)
//     const tempOrgId = new mongoose.Types.ObjectId();
//     const ownerUser = new User({
//       name: ownerName,
//       email: ownerEmail,
//       password: ownerPassword,
//       organizationId: tempOrgId,
//       status: 'approved', // Auto-approve the owner
//     });
//     const newUser = await ownerUser.save({ session });

//     // --- Step 2: Create "Super Admin" Role
//     const superAdminRole = new Role({
//       name: 'Super Admin',
//       organizationId: tempOrgId,
//       permissions: Role.allPermissions, // Gives all permissions
//       isSuperAdmin: true,
//     });
//     const newRole = await superAdminRole.save({ session });

//     // --- Step 3: Create Organization
//     const org = new Organization({
//       _id: tempOrgId, // Use the same ID
//       name: organizationName,
//       uniqueShopId: uniqueShopId || generateUniqueShopId(),
//       primaryEmail,
//       primaryPhone,
//       gstNumber,
//       owner: newUser._id,
//     });
//     const newOrg = await org.save({ session });

//     // --- Step 4: Create Main Branch
//     const branch = new Branch({
//       name: mainBranchName || 'Main Branch',
//       address: mainBranchAddress,
//       organizationId: newOrg._id,
//       isMainBranch: true,
//     });
//     const newBranch = await branch.save({ session });

//     // --- Step 5: Link Everything Together
//     newOrg.mainBranch = newBranch._id;
//     newOrg.branches.push(newBranch._id);

//     newUser.organizationId = newOrg._id; // Update user with final ID
//     newUser.branchId = newBranch._id;
//     newUser.role = newRole._id;

//     await newOrg.save({ session });
//     await newUser.save({ session });

//     // --- Step 6: Commit transaction
//     await session.commitTransaction();

//     // --- Step 7: Create JWT
//     const token = signToken(newUser);
//     newUser.password = undefined;

//     res.status(201).json({
//       status: 'success',
//       message: 'Organization created successfully!',
//       token,
//       data: {
//         organization: newOrg,
//         owner: newUser,
//         branch: newBranch,
//         role: newRole,
//       },
//     });
//   } catch (err) {
//     // Rollback on error
//     await session.abortTransaction();

//     // Handle duplicate keys gracefully
//     if (err.code === 11000) {
//       if (err.keyPattern?.uniqueShopId) {
//         return next(new AppError('This Shop ID is already taken.', 400));
//       }
//       if (err.keyPattern?.email) {
//         return next(new AppError('This email address is already in use.', 400));
//       }
//     }

//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* -------------------------------------------------------------
//  * Approve Member (The Corrected Version)
//  * Requires: userId, roleId, branchId
// ------------------------------------------------------------- */
// exports.approveMember = catchAsync(async (req, res, next) => {
//   const { userId, roleId, branchId } = req.body;

//   // --- 1. Validation ---
//   if (!userId || !roleId || !branchId) {
//     return next(
//       new AppError('Please provide a userId, roleId, and branchId', 400)
//     );
//   }

//   // Find the organization and verify the logged-in user is the owner
//   const org = await Organization.findOne({
//     _id: req.user.organizationId, // User's org
//     owner: req.user.id, // User is the owner
//   });

//   if (!org) {
//     return next(new AppError('Not authorized to perform this action', 403));
//   }

//   // --- 2. Find the User to be approved ---
//   const user = await User.findOne({
//     _id: userId,
//     organizationId: req.user.organizationId,
//     status: 'pending', // Only approve pending users
//   });

//   if (!user) {
//     return next(new AppError('No pending user found with that ID', 404));
//   }

//   // --- 3. Verify the Role and Branch belong to this Org ---
//   const role = await Role.findOne({
//     _id: roleId,
//     organizationId: req.user.organizationId,
//   });
//   const branch = await Branch.findOne({
//     _id: branchId,
//     organizationId: req.user.organizationId,
//   });

//   if (!role || !branch) {
//     return next(new AppError('Invalid Role or Branch selected', 400));
//   }

//   // --- 4. Update documents in a transaction ---
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // A) Update the User
//     user.status = 'approved';
//     user.role = roleId;
//     user.branchId = branchId;
//     await user.save({ session });

//     // B) Update the Organization
//     org.members.push(userId);
//     org.approvalRequests.pull(userId); // Assumes approvalRequests just holds User IDs
//     await org.save({ session });

//     // C) Commit
//     await session.commitTransaction();

//     res.status(200).json({
//       status: 'success',
//       message: 'Member approved and activated successfully',
//       data: { user },
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* -------------------------------------------------------------
//  * CONTROLLERS FOR A USER'S *OWN* ORGANIZATION
// ------------------------------------------------------------- */

// /**
//  * @desc Get the logged-in user's own organization details
//  */
// exports.getMyOrganization = (req, res, next) => {
//   req.params.id = req.user.organizationId;
//   factory.getOne(Organization, [
//     { path: 'owner', select: 'name email' },
//     { path: 'members', select: 'name email role' },
//     { path: 'branches', select: 'name city state' },
//   ])(req, res, next);
// };

// /**
//  * @desc Update the logged-in user's own organization
//  */
// exports.updateMyOrganization = (req, res, next) => {
//   req.params.id = req.user.organizationId;
//   if (req.body.owner) {
//     return next(new AppError('You cannot change the organization owner.', 403));
//   }
//   factory.updateOne(Organization)(req, res, next);
// };

// /**
//  * @desc Delete the logged-in user's own organization
//  * (ONLY the true owner can do this)
//  */
// exports.deleteMyOrganization = catchAsync(async (req, res, next) => {
//   const org = await Organization.findById(req.user.organizationId);
//   if (!org) {
//     return next(new AppError('Organization not found.', 404));
//   }
//   if (org.owner.toString() !== req.user.id) {
//     return next(
//       new AppError('You are not the owner. You cannot delete this organization.', 403)
//     );
//   }
//   req.params.id = req.user.organizationId;
//   factory.deleteOne(Organization)(req, res, next);
// });

// /* -------------------------------------------------------------
//  * PLATFORM-ADMIN CONTROLLERS (using the factory)
// ------------------------------------------------------------- */

// // Get all organizations
// exports.getAllOrganizations = factory.getAll(Organization);

// // Get single organization
// exports.getOrganization = factory.getOne(Organization, [
//   { path: 'owner', select: 'name email' },
//   { path: 'members', select: 'name email role' },
//   { path: 'branches', select: 'name city state' },
// ]);

// // Update organization
// exports.updateOrganization = factory.updateOne(Organization);

// // Delete organization
// exports.deleteOrganization = factory.deleteOne(Organization);


// // grok
// // const mongoose = require('mongoose');
// // const crypto = require('crypto');
// // const Organization = require('../models/organizationModel');
// // const Branch = require('../models/branchModel');
// // const User = require('../models/userModel');
// // const Role = require('../models/roleModel');
// // const catchAsync = require('../utils/catchAsync');
// // const AppError = require('../utils/appError');
// // const factory = require('../utils/handlerFactory');// // const { signToken } = require('../utils/authUtils');

// // /* -------------------------------------------------------------
// //    Utility: Generate Unique Shop ID
// // ------------------------------------------------------------- */
// // const generateUniqueShopId = () => {
// //   return `ORG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
// // };

// // /* -------------------------------------------------------------
// //    Create New Organization (Transactional)
// //    Flow:
// //    1. Create Owner (Super Admin)
// //    2. Create Role ("Super Admin" with all permissions)
// //    3. Create Organization
// //    4. Create Main Branch
// //    5. Link all together
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
// //     mainBranchAddress, // { street, city, state, zipCode }
// //   } = req.body;

// //   // Start transaction
// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     // --- Step 1: Create the Owner User (temporary orgId)
// //     const tempOrgId = new mongoose.Types.ObjectId();
// //     const ownerUser = new User({
// //       name: ownerName,
// //       email: ownerEmail,
// //       password: ownerPassword,
// //       organizationId: tempOrgId,
// //       status: 'approved',
// //     });
// //     const newUser = await ownerUser.save({ session });

// //     // --- Step 2: Create "Super Admin" Role
// //     const superAdminRole = new Role({
// //       name: 'Super Admin',
// //       organizationId: tempOrgId,
// //       permissions: Role.allPermissions,
// //       isSuperAdmin: true,
// //     });
// //     const newRole = await superAdminRole.save({ session });

// //     // --- Step 3: Create Organization
// //     const org = new Organization({
// //       _id: tempOrgId,
// //       name: organizationName,
// //       uniqueShopId: uniqueShopId || generateUniqueShopId(),
// //       primaryEmail,
// //       primaryPhone,
// //       gstNumber,
// //       owner: newUser._id,
// //     });
// //     const newOrg = await org.save({ session });

// //     // --- Step 4: Create Main Branch
// //     const branch = new Branch({
// //       name: mainBranchName || 'Main Branch',
// //       address: mainBranchAddress,
// //       organizationId: newOrg._id,
// //       isMainBranch: true,
// //     });
// //     const newBranch = await branch.save({ session });

// //     // --- Step 5: Link Everything Together
// //     newOrg.mainBranch = newBranch._id;
// //     newOrg.branches.push(newBranch._id);

// //     newUser.organizationId = newOrg._id;
// //     newUser.branchId = newBranch._id;
// //     newUser.role = newRole._id;

// //     await newOrg.save({ session });
// //     await newUser.save({ session });

// //     // --- Step 6: Commit transaction
// //     await session.commitTransaction();

// //     // --- Step 7: Create JWT
// //     const token = signToken(newUser);
// //     newUser.password = undefined;

// //     res.status(201).json({
// //       status: 'success',
// //       message: 'Organization created successfully!',
// //       token,
// //       data: {
// //         organization: newOrg,
// //         owner: newUser,
// //         branch: newBranch,
// //         role: newRole,
// //       },
// //     });
// //   } catch (err) {
// //     // Rollback on error
// //     await session.abortTransaction();

// //     // Handle duplicate keys gracefully
// //     if (err.code === 11000) {
// //       if (err.keyPattern?.uniqueShopId) {
// //         return next(new AppError('This Shop ID is already taken.', 400));
// //       }
// //       if (err.keyPattern?.email) {
// //         return next(new AppError('This email address is already in use.', 400));
// //       }
// //     }

// //     next(err);
// //   } finally {
// //     session.endSession();
// //   }
// // });

// // /* -------------------------------------------------------------
// //    CRUD Operations (Reusable via Handler Factory)
// // ------------------------------------------------------------- */

// // // ✅ Get all organizations (Superadmin access)
// // exports.getAllOrganizations = factory.getAll(Organization);

// // // ✅ Get single organization (with population)
// // exports.getOrganization = factory.getOne(Organization, [
// //   { path: 'owner', select: 'name email' },
// //   { path: 'members', select: 'name email role' },
// //   { path: 'branches', select: 'name city state' },
// // ]);
// // /**
// //  * @desc Get the logged-in user's own organization details
// //  */
// // exports.getMyOrganization = (req, res, next) => {
// //   // We get the org ID from the user's token, not the URL params
// //   // This is more secure.
// //   req.params.id = req.user.organizationId;
  
// //   // We can re-use the factory 'getOne' function
// //   factory.getOne(Organization, [
// //     { path: 'owner', select: 'name email' },
// //     { path: 'members', select: 'name email role' },
// //     { path: 'branches', select: 'name city state' },
// //   ])(req, res, next);
// // };

// // // ✅ Update organization
// // exports.updateOrganization = factory.updateOne(Organization);

// // // ✅ Delete organization (soft delete supported)
// // exports.deleteOrganization = factory.deleteOne(Organization);

// // /* -------------------------------------------------------------
// //    Approve Member (For Org Owner)
// //    When employees sign up using org ID, they need owner approval.
// // ------------------------------------------------------------- */
// // exports.approveMember = catchAsync(async (req, res, next) => {
// //   const { organizationId, userId } = req.body;

// //   const org = await Organization.findOne({
// //     _id: organizationId,
// //     owner: req.user._id,
// //   });

// //   if (!org) return next(new AppError('Organization not found or unauthorized', 403));

// //   const user = await User.findById(userId);
// //   if (!user) return next(new AppError('User not found', 404));

// //   user.status = 'approved';
// //   user.isApproved = true;

// //   org.members.push(userId);

// //   await Promise.all([user.save(), org.save()]);

// //   res.status(200).json({
// //     status: 'success',
// //     message: 'Member approved successfully',
// //     data: { user },
// //   });
// // });



// // /* -------------------------------------------------------------
// //  * Approve Member (The Corrected Version)
// //  * Requires: userId, roleId, branchId
// // ------------------------------------------------------------- */
// // exports.approveMember = catchAsync(async (req, res, next) => {
// //   const { userId, roleId, branchId } = req.body;

// //   // --- 1. Validation ---
// //   if (!userId || !roleId || !branchId) {
// //     return next(new AppError('Please provide a userId, roleId, and branchId', 400));
// //   }

// //   // Find the organization and verify the logged-in user is the owner
// //   const org = await Organization.findOne({
// //     _id: req.user.organizationId, // User's org
// //     owner: req.user.id,             // User is the owner
// //   });

// //   if (!org) {
// //     return next(new AppError('Not authorized to perform this action', 403));
// //   }

// //   // --- 2. Find the User to be approved ---
// //   const user = await User.findOne({
// //     _id: userId,
// //     organizationId: req.user.organizationId,
// //     status: 'pending', // Only approve pending users
// //   });

// //   if (!user) {
// //     return next(new AppError('No pending user found with that ID', 404));
// //   }

// //   // --- 3. Verify the Role and Branch belong to this Org ---
// //   // (This is a critical security check)
// //   const role = await Role.findOne({ _id: roleId, organizationId: req.user.organizationId });
// //   const branch = await Branch.findOne({ _id: branchId, organizationId: req.user.organizationId });

// //   if (!role || !branch) {
// //     return next(new AppError('Invalid Role or Branch selected', 400));
// //   }

// //   // --- 4. Update documents in a transaction ---
// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     // A) Update the User
// //     user.status = 'approved';
// //     user.role = roleId;
// //     user.branchId = branchId;
// //     await user.save({ session });

// //     // B) Update the Organization
// //     // Pull from 'approvalRequests' and push to 'members'
// //     org.members.push(userId);
// //     org.approvalRequests.pull(userId); // Assumes approvalRequests just holds User IDs
// //     await org.save({ session });

// //     // C) Commit
// //     await session.commitTransaction();

// //     res.status(200).json({
// //       status: 'success',
// //       message: 'Member approved and activated successfully',
// //       data: { user },
// //     });

// //   } catch (err) {
// //     await session.abortTransaction();
// //     next(err);
// //   } finally {
// //     session.endSession();
// //   }
// // });


// // // gemini
// // // const mongoose = require('mongoose');
// // // const Organization = require('../models/organizationModel');
// // // const Branch = require('../models/branchModel');
// // // const User = require('../models/userModel');
// // // const Role = require('../models/roleModel');
// // // const catchAsync = require('../utils/catchAsync');
// // // const AppError = require('../utils/appError');
// // // const { signToken } = require('../utils/authUtils');

// // // exports.createOrganization = catchAsync(async (req, res, next) => {
// // //   // 1. Get all data from the request body
// // //   const {
// // //     // Org fields
// // //     organizationName,
// // //     uniqueShopId,
// // //     primaryEmail,
// // //     primaryPhone,
// // //     gstNumber,
// // //     // Owner fields
// // //     ownerName,
// // //     ownerEmail,
// // //     ownerPassword,
// // //     // Branch fields
// // //     mainBranchName,
// // //     mainBranchAddress, // This should be an object: { street, city, state, zipCode }
// // //   } = req.body;

// // //   // 2. Start a Mongoose session for a transaction
// // //   const session = await mongoose.startSession();
// // //   session.startTransaction();

// // //   try {
// // //     // --- STEP 1: Create the User (Super Admin) ---
// // //     // We create them first, but they are incomplete.
// // //     const user = new User({
// // //       name: ownerName,
// // //       email: ownerEmail,
// // //       password: ownerPassword,
// // //       // We set a temporary orgId. We'll update it once the org is created.
// // //       organizationId: new mongoose.Types.ObjectId(),
// // //       status: 'approved', // Manually approve the owner
// // //     });
// // //     const newUser = await user.save({ session });

// // //     // --- STEP 2: Create the "Super Admin" Role ---
// // //     const superAdminRole = new Role({
// // //       name: 'Super Admin',
// // //       organizationId: newUser.organizationId, // Use the same temporary ID
// // //       permissions: Role.allPermissions, // Give them all permissions
// // //       isSuperAdmin: true,
// // //     });
// // //     const newRole = await superAdminRole.save({ session });

// // //     // --- STEP 3: Create the Organization ---
// // //     const org = new Organization({
// // //       _id: newUser.organizationId, // Use the same ID as the user
// // //       name: organizationName,
// // //       uniqueShopId: uniqueShopId,
// // //       primaryEmail: primaryEmail,
// // //       primaryPhone: primaryPhone,
// // //       gstNumber: gstNumber,
// // //       owner: newUser._id,
// // //     });
// // //     const newOrg = await org.save({ session });

// // //     // --- STEP 4: Create the Main Branch ---
// // //     const branch = new Branch({
// // //       name: mainBranchName,
// // //       address: mainBranchAddress,
// // //       organizationId: newOrg._id,
// // //       isMainBranch: true,
// // //     });
// // //     const newBranch = await branch.save({ session });

// // //     // --- STEP 5: Link everything together ---
// // //     // A) Link Branch to Org
// // //     newOrg.mainBranch = newBranch._id;
// // //     newOrg.branches.push(newBranch._id);

// // //     // B) Link Org and Branch to User
// // //     newUser.organizationId = newOrg._id; // Update the final orgId
// // //     newUser.branchId = newBranch._id;
// // //     newUser.role = newRole._id;

// // //     // Save the final updates
// // //     await newOrg.save({ session });
// // //     await newUser.save({ session });

// // //     // --- STEP 6: Commit the transaction ---
// // //     await session.commitTransaction();

// // //     // --- STEP 7: Create a token and send the response ---
// // //     const token = signToken(newUser);

// // //     // Remove password from output
// // //     newUser.password = undefined;

// // //     res.status(201).json({
// // //       status: 'success',
// // //       token,
// // //       data: {
// // //         organization: newOrg,
// // //         user: newUser,
// // //       },
// // //     });

// // //   } catch (err) {
// // //     // --- STEP 8: Abort transaction on error ---
// // //     await session.abortTransaction();

// // //     // Check for duplicate key errors (e.g., uniqueShopId or user email)
// // //     if (err.code === 11000) {
// // //       if (err.keyPattern.uniqueShopId) {
// // //         return next(new AppError('This Shop ID is already taken.', 400));
// // //       }
// // //       if (err.keyPattern.email) {
// // //         return next(new AppError('This email address is already in use.', 400));
// // //       }
// // //     }

// // //     // Pass other errors to the global error handler
// // //     next(err);
// // //   } finally {
// // //     // --- STEP 9: End the session ---
// // //     session.endSession();
// // //   }
// // // });