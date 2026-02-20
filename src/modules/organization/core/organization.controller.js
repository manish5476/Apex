const mongoose = require('mongoose');
const crypto = require('crypto');
const catchAsync = require('../../../core/utils/catchAsync');
const AppError = require('../../../core/utils/appError');
const factory = require('../../../core/utils/handlerFactory');
const sendEmail = require('../../../core/utils/_legacy/email');
const { signToken } = require('../../../core/utils/authUtils');

const Organization = require('./organization.model');
const Branch = require('./branch.model');
const User = require('../../auth/core/user.model');
const Role = require('../../auth/core/role.model');
const Shift = require('../../HRMS/models/shift.model');
const LeaveBalance = require('../../HRMS/models/leaveBalance.model');
const Department = require('../../HRMS/models/department.model');
const Designation = require('../../HRMS/models/designation.model');
const { emitToOrg, emitToUser } = require('../../../core/utils/_legacy/socket');
/* -------------------------------------------------------------
 * Utility: Generate Unique Shop ID
------------------------------------------------------------- */
const generateUniqueShopId = () =>
  `ORG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;


// Helper for Financial Year
const getFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

// exports.createOrganization = catchAsync(async (req, res, next) => {
//   const { 
//     organizationName, uniqueShopId, primaryEmail, primaryPhone, gstNumber, 
//     ownerName, ownerEmail, ownerPassword, 
//     mainBranchName, mainBranchAddress 
//   } = req.body;
  
//   if (!organizationName || !ownerName || !ownerEmail || !ownerPassword)
//     return next(new AppError('Missing required organization or owner fields', 400));

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // 1. Generate IDs upfront (helps with circular deps)
//     const orgId = new mongoose.Types.ObjectId();
//     const branchId = new mongoose.Types.ObjectId();
//     const roleId = new mongoose.Types.ObjectId();
//     const ownerId = new mongoose.Types.ObjectId();
//     const shiftId = new mongoose.Types.ObjectId();
//     const deptId = new mongoose.Types.ObjectId();
//     const desigId = new mongoose.Types.ObjectId();

//     // 2. Create Organization
//     const newOrg = new Organization({
//       _id: orgId,
//       name: organizationName,
//       uniqueShopId: uniqueShopId, // Validation handles duplicates
//       primaryEmail,
//       primaryPhone,
//       gstNumber,
//       owner: ownerId, // Link to future owner
//       mainBranch: branchId,
//       branches: [branchId],
//       whatsappWallet: { credits: 50 },
//       features: { whatsappEnabled: true },
//       settings: { 
//         currency: 'INR', 
//         timezone: 'Asia/Kolkata', 
//         financialYearStart: 'April' 
//       }
//     });

//     // 3. Create Main Branch
//     const newBranch = new Branch({
//       _id: branchId,
//       name: mainBranchName || 'Main Branch',
//       address: mainBranchAddress,
//       organizationId: orgId,
//       isMainBranch: true,
//       managerId: ownerId // Owner manages main branch initially
//     });

//     // 4. Create Super Admin Role
//     const newRole = new Role({
//       _id: roleId,
//       name: 'Super Admin',
//       organizationId: orgId,
//       permissions: ["*"], // Wildcard permission
//       isSuperAdmin: true,
//       isDefault: true
//     });

//     // 5. 🟢 HRMS DEFAULTS: Shift, Dept, Designation
//     const defaultShift = new Shift({
//       _id: shiftId,
//       name: 'General Shift',
//       organizationId: orgId,
//       startTime: '09:00', 
//       endTime: '18:00',
//       gracePeriodMins: 15,
//       halfDayThresholdHrs: 4,
//       minFullDayHrs: 8,
//       weeklyOffs: [0], // Sunday
//       isActive: true
//     });

//     const defaultDept = new Department({
//       _id: deptId,
//       name: 'Administration',
//       organizationId: orgId,
//       branchId: branchId,
//       headOfDepartment: ownerId
//     });

//     const defaultDesig = new Designation({
//       _id: desigId,
//       title: 'Director',
//       organizationId: orgId,
//       level: 10 // Top level
//     });

//     // 6. Create Owner (The First Employee)
//     const newOwner = new User({
//       _id: ownerId,
//       name: ownerName,
//       email: ownerEmail,
//       password: ownerPassword,
//       phone: primaryPhone,
      
//       organizationId: orgId,
//       branchId: branchId,
//       role: roleId,
      
//       isOwner: true,
//       isSuperAdmin: true,
//       status: 'approved',
//       isActive: true,

//       // 🟢 HRMS Profile Populated
//       employeeProfile: {
//         employeeId: 'EMP-001',
//         departmentId: deptId,
//         designationId: desigId,
//         dateOfJoining: new Date(),
//         reportingManagerId: null // Owners have no manager
//       },

//       attendanceConfig: {
//         shiftId: shiftId,
//         isAttendanceEnabled: true,
//         allowWebPunch: true,
//         allowMobilePunch: true,
//         enforceGeoFence: false // Owners usually bypass geofence
//       }
//     });

//     // 7. 🟢 HRMS: Create Leave Balance for Owner
//     const leaveBalance = new LeaveBalance({
//       user: ownerId,
//       organizationId: orgId,
//       financialYear: getFinancialYear(),
//       casualLeave: { total: 12, used: 0 },
//       sickLeave: { total: 10, used: 0 },
//       earnedLeave: { total: 15, used: 0 } // Owners might give themselves more
//     });

//     // 8. SAVE EVERYTHING (Parallel for speed)
//     await Promise.all([
//       newOrg.save({ session }),
//       newBranch.save({ session }),
//       newRole.save({ session }),
//       defaultShift.save({ session }),
//       defaultDept.save({ session }),
//       defaultDesig.save({ session }),
//       newOwner.save({ session }),
//       leaveBalance.save({ session })
//     ]);

//     // 9. Commit
//     await session.commitTransaction();

//     // 10. Clean Response
//     const token = signToken(newOwner._id); // Pass ID or User based on your util
//     newOwner.password = undefined;

//     res.status(201).json({
//       status: 'success',
//       message: 'Organization set up successfully!',
//       token,
//       data: { 
//         organization: newOrg, 
//         owner: newOwner, 
//         setup: {
//           branch: newBranch.name,
//           role: newRole.name,
//           shift: defaultShift.name,
//           department: defaultDept.name,
//           designation: defaultDesig.name
//         }
//       },
//     });

//   } catch (err) {
//     await session.abortTransaction();
    
//     // Better Error Handling
//     if (err.code === 11000) {
//       if (err.keyPattern?.uniqueShopId)
//         return next(new AppError('This Shop ID is already taken. Please try another.', 400));
//       if (err.keyPattern?.email)
//         return next(new AppError('This email is already registered.', 400));
//     }
    
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// // /* -------------------------------------------------------------
// //  * Create New Organization (Transactional)
// // ------------------------------------------------------------- */
// // exports.createOrganization = catchAsync(async (req, res, next) => {
// //   const { 
// //     organizationName, uniqueShopId, primaryEmail, primaryPhone, gstNumber, 
// //     ownerName, ownerEmail, ownerPassword, 
// //     mainBranchName, mainBranchAddress 
// //   } = req.body;
  
// //   if (!organizationName || !ownerName || !ownerEmail || !ownerPassword)
// //     return next(new AppError('Missing required organization or owner fields', 400));

// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     const tempOrgId = new mongoose.Types.ObjectId();

// //     // Step 1: Create the Owner (Initial Save)
// //     const newUser = await new User({
// //       name: ownerName,
// //       email: ownerEmail,
// //       password: ownerPassword,
// //       organizationId: tempOrgId, // Link User to Org
// //       status: 'approved',
// //       attendanceConfig: {
// //         isAttendanceEnabled: true,
// //         allowWebPunch: true,
// //         allowMobilePunch: true
// //       }
// //     }).save({ session });

// //     // Step 2: Create Role (Super Admin)
// //     const newRole = await new Role({
// //       name: 'Super Admin',
// //       organizationId: tempOrgId,
// //       permissions: Role.allPermissions || [], 
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
// //       whatsappWallet: { credits: 50 },
// //       features: { whatsappEnabled: true }
// //     }).save({ session });

// //     // Step 4: Create Main Branch
// //     const newBranch = await new Branch({
// //       name: mainBranchName || 'Main Branch',
// //       address: mainBranchAddress,
// //       organizationId: newOrg._id,
// //       isMainBranch: true,
// //     }).save({ session });

// //     // Step 4.5: Create Default Shift
// //     const defaultShift = await new Shift({
// //         name: 'General Shift',
// //         organizationId: newOrg._id,
// //         startTime: '09:00',
// //         endTime: '18:00',
// //         gracePeriodMins: 15,
// //         halfDayThresholdHrs: 4,
// //         minFullDayHrs: 8,
// //         weeklyOffs: [0],
// //         isActive: true
// //     }).save({ session });

// //     // Step 5: Link Everything & Update Owner
// //     newOrg.mainBranch = newBranch._id;
// //     newOrg.branches.push(newBranch._id);
// //     // ❌ REMOVED: newOrg.members.push(...) - The array is gone!

// //     // Update Owner Links
// //     newUser.organizationId = newOrg._id;
// //     newUser.branchId = newBranch._id;
// //     newUser.role = newRole._id;
// //     newUser.attendanceConfig.shiftId = defaultShift._id;

// //     // Final Save
// //     await Promise.all([newOrg.save({ session }), newUser.save({ session })]);
    
// //     await session.commitTransaction();
    
// //     // Fetch clean data for response
// //     const orgId = newOrg._id;
// //     const [branches, roles] = await Promise.all([
// //       Branch.find({ organizationId: orgId, isActive: true }).select('_id name address isMainBranch').lean(),
// //       Role.find({ organizationId: orgId }).select('_id name permissions isSuperAdmin isDefault').lean()
// //     ]);

// //     const token = signToken(newUser);
// //     newUser.password = undefined;

// //     res.status(201).json({
// //       status: 'success',
// //       message: 'Organization created successfully!',
// //       token,
// //       allbranches: branches,
// //       allroles: roles,
// //       data: { 
// //           organization: newOrg, 
// //           owner: newUser, 
// //           branch: newBranch, 
// //           role: newRole,
// //           shift: defaultShift
// //       },
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
exports.createOrganization = catchAsync(async (req, res, next) => {
  const { 
    organizationName, uniqueShopId, primaryEmail, primaryPhone, gstNumber, 
    ownerName, ownerEmail, ownerPassword, 
    mainBranchName, mainBranchAddress 
  } = req.body;
  
  if (!organizationName || !ownerName || !ownerEmail || !ownerPassword)
    return next(new AppError('Missing required organization or owner fields', 400));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Generate IDs upfront
    const orgId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();
    const ownerId = new mongoose.Types.ObjectId();
    const shiftId = new mongoose.Types.ObjectId();
    const deptId = new mongoose.Types.ObjectId();
    const desigId = new mongoose.Types.ObjectId();

    // 2. Create Organization
    const newOrg = new Organization({
      _id: orgId,
      name: organizationName,
      uniqueShopId, // Validation handles duplicates
      primaryEmail,
      primaryPhone,
      gstNumber,
      owner: ownerId, // Link to future owner
      mainBranch: branchId,
      branches: [branchId],
      whatsappWallet: { credits: 50 },
      features: { whatsappEnabled: true },
      settings: { 
        currency: 'INR', 
        timezone: 'Asia/Kolkata', 
        financialYearStart: 'April' 
      }
    });

    // 3. Create Main Branch
    const newBranch = new Branch({
      _id: branchId,
      name: mainBranchName || 'Main Branch',
      address: mainBranchAddress,
      organizationId: orgId,
      isMainBranch: true,
      managerId: ownerId // Owner manages main branch initially
    });

    // 4. Create Super Admin Role
    const newRole = new Role({
      _id: roleId,
      name: 'Super Admin',
      organizationId: orgId,
      permissions: ["*"], // Wildcard permission
      isSuperAdmin: true,
      isDefault: true
    });

    // 5. HRMS Defaults: Shift, Dept, Designation
    const defaultShift = new Shift({
      _id: shiftId,
      name: 'General Shift',
      organizationId: orgId,
      startTime: '09:00', 
      endTime: '18:00',
      gracePeriodMins: 15,
      halfDayThresholdHrs: 4,
      minFullDayHrs: 8,
      weeklyOffs: [0], // Sunday
      isActive: true
    });

    const defaultDept = new Department({
      _id: deptId,
      name: 'Administration',
      organizationId: orgId,
      branchId: branchId,
      headOfDepartment: ownerId
    });

    const defaultDesig = new Designation({
      _id: desigId,
      title: 'Director',
      organizationId: orgId,
      level: 10 // Top level
    });

    // 6. Create Owner (First Employee)
    const newOwner = new User({
      _id: ownerId,
      name: ownerName,
      email: ownerEmail,
      password: ownerPassword,
      phone: primaryPhone,
      
      organizationId: orgId,
      branchId: branchId,
      role: roleId,
      
      isOwner: true,
      isSuperAdmin: true,
      status: 'approved',
      isActive: true,

      // HRMS Profile
      employeeProfile: {
        employeeId: 'EMP-001',
        departmentId: deptId,
        designationId: desigId,
        dateOfJoining: new Date(),
        reportingManagerId: null // Owners have no manager
      },

      attendanceConfig: {
        shiftId: shiftId,
        isAttendanceEnabled: true,
        allowWebPunch: true,
        allowMobilePunch: true,
        enforceGeoFence: false // Owners usually bypass geofence
      }
    });

    // 7. Create Leave Balance for Owner
    const leaveBalance = new LeaveBalance({
      user: ownerId,
      organizationId: orgId,
      financialYear: getFinancialYear(),
      casualLeave: { total: 12, used: 0 },
      sickLeave: { total: 10, used: 0 },
      earnedLeave: { total: 15, used: 0 }
    });

    // 8. Save Everything (Parallel)
    await Promise.all([
      newOrg.save({ session }),
      newBranch.save({ session }),
      newRole.save({ session }),
      defaultShift.save({ session }),
      defaultDept.save({ session }),
      defaultDesig.save({ session }),
      newOwner.save({ session }),
      leaveBalance.save({ session })
    ]);

    // 9. Commit Transaction
    await session.commitTransaction();

    // 10. Response Data
    const token = signToken(newOwner._id);
    newOwner.password = undefined;

    res.status(201).json({
      status: 'success',
      message: 'Organization set up successfully!',
      token,
      data: { 
        organization: newOrg, 
        owner: newOwner, 
        setup: {
          branch: newBranch.name,
          role: newRole.name,
          shift: defaultShift.name,
          department: defaultDept.name,
          designation: defaultDesig.name
        }
      },
    });

  } catch (err) {
    await session.abortTransaction();
    
    // Improved error handling
    if (err.code === 11000) {
      if (err.keyPattern?.uniqueShopId)
        return next(new AppError('This Shop ID is already taken. Please try another.', 400));
      if (err.keyPattern?.email)
        return next(new AppError('This email is already registered.', 400));
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

  // ✅ CORRECT: We query the User model, not the Org array
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

    // ❌ REMOVED: org.members.push(...). 
    // The user is already linked via `organizationId`, so we just save the user.

    await user.save({ session });
    // Note: We don't need to save `org` because we didn't change it.

    await session.commitTransaction();

    // 3. Prepare Safe Response
    const userResponse = user.toObject();
    userResponse.permissions = role.permissions || [];
    userResponse.role = role;

    // 4. Notifications
    if (typeof emitToOrg === "function") {
      emitToOrg(req.user.organizationId, "newNotification", {
        title: "Member Approved",
        message: `${user.name} has been approved.`,
        type: "success",
        createdAt: new Date()
      });
    }

    try {
      sendEmail({
        email: user.email,
        subject: "Account Approved",
        message: `Congratulations ${user.name}, your account has been approved.`,
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
 * Reject Member
------------------------------------------------------------- */
// ✅ NO CHANGES NEEDED HERE (Logic was already correct)
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
  const orgName = req.user.organizationName || "the organization"; 

  if (typeof emitToUser === "function") {
    emitToUser(user._id, "accountRejected", {
      message: "Your request to join the organization was declined.",
      reason: "Admin decision"
    });
  }

  try {
    await sendEmail({
      email: userEmail,
      subject: "Membership Request Declined",
      message: `Hello ${userName},\n\nYour request to join ${orgName} has been declined.`,
    });
  } catch (emailErr) {
    console.error(`Failed to send rejection email:`, emailErr.message);
  }

  await User.deleteOne({ _id: user._id });

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
 * Update My Organization (Fixed for Nested Objects)
------------------------------------------------------------- */
exports.updateMyOrganization = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;

  if (!orgId) {
    return next(new AppError("You are not linked to any organization.", 400));
  }

  if (req.body.owner) {
    return next(new AppError("You cannot change the organization owner here.", 403));
  }

  // Define allowed root fields
  const allowedFields = [
    "name", "primaryEmail", "primaryPhone", "secondaryEmail", "secondaryPhone", 
    "gstNumber", "uniqueShopId", "logo"
  ];

  const updates = {};
  
  // 1. Process root level fields
  Object.keys(req.body).forEach((key) => {
    if (allowedFields.includes(key)) updates[key] = req.body[key];
  });

  // 2. Process Nested Address safely (Dot Notation for MongoDB)
  if (req.body.address) {
    const addressFields = ["street", "city", "state", "zipCode", "country"];
    addressFields.forEach(field => {
      if (req.body.address[field] !== undefined) {
        updates[`address.${field}`] = req.body.address[field];
      }
    });
  }

  // 3. Process Nested Settings
  if (req.body.settings) {
    const settingFields = ["currency", "timezone", "financialYearStart"];
    settingFields.forEach(field => {
      if (req.body.settings[field] !== undefined) {
        updates[`settings.${field}`] = req.body.settings[field];
      }
    });
  }

  if (Object.keys(updates).length === 0) {
    return next(new AppError("No valid fields provided for update.", 400));
  }

  const updatedOrg = await Organization.findByIdAndUpdate(
    orgId,
    { $set: updates }, // Use $set to prevent overwriting the whole document
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

// exports.updateMyOrganization = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;

//   if (!orgId) {
//     return next(new AppError("You are not linked to any organization.", 400));
//   }

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


exports.deleteMyOrganization = catchAsync(async (req, res, next) => {
  const org = await Organization.findById(req.user.organizationId);
  if (!org) return next(new AppError('Organization not found.', 404));
  if (org.owner.toString() !== req.user.id)
    return next(new AppError('Only the owner can delete this organization.', 403));
  req.params.id = req.user.organizationId;
  return factory.deleteOne(Organization)(req, res, next);
});

/* -------------------------------------------------------------
  Self-service: Get My Organization (With Populated Members)
------------------------------------------------------------- */
exports.getMyOrganization = catchAsync(async (req, res, next) => {
  if (!req.user.organizationId) {
    return next(new AppError('This user is not linked to any organization.', 400));
  }

  // 1. Fetch the Organization (Standard fields)
  const org = await Organization.findById(req.user.organizationId)
    .populate({ path: 'owner', select: 'name email' })
    .populate({ path: 'branches', select: 'name city state' });

  if (!org) {
    return next(new AppError('Organization not found.', 404));
  }

  // 2. 🔥 FETCH MEMBERS FROM USER COLLECTION (The New Scalable Way)
  // Instead of populating the old array, we find all users linked to this Org ID.
  const staffList = await User.find({ 
    organizationId: org._id,
    status: { $ne: 'rejected' } // Optional: Hide rejected users
  })
  .select('name email role status avatar phone') // Select fields you need
  .populate('role', 'name'); // Optional: Show role name instead of ID

  // 3. Merge into response
  // We convert Mongoose doc to a plain object so we can overwrite 'members'
  const orgData = org.toObject();
  orgData.members = staffList; 

  res.status(200).json({
    status: 'success',
    data: orgData 
  });
});

/* ------------------------------------------------------------- 
  Platform Admin: Get Any Organization
------------------------------------------------------------- */
exports.getOrganization = catchAsync(async (req, res, next) => {
  const org = await Organization.findById(req.params.id)
    .populate({ path: 'owner', select: 'name email' })
    .populate({ path: 'branches', select: 'name city state' });
  if (!org) return next(new AppError('No organization found with that ID', 404));
  const staffList = await User.find({ organizationId: org._id }).select('name email role status phone');
  const orgData = org.toObject();
  orgData.members = staffList;
  res.status(200).json({
    status: 'success',
    data: orgData
  });
});

/* -------------------------------------------------------------
 * Platform-admin CRUD
------------------------------------------------------------- */
exports.getAllOrganizations = factory.getAll(Organization);
exports.updateOrganization = factory.updateOne(Organization);
exports.deleteOrganization = factory.deleteOne(Organization);





// const mongoose = require('mongoose');
// const crypto = require('crypto');
// const Organization = require('./organization.model');
// const Branch = require('./branch.model');
// const User = require('../../auth/core/user.model');
// const Role = require('../../auth/core/role.model');
// const catchAsync = require('../../../core/utils/catchAsync');
// const AppError = require('../../../core/utils/appError');
// const factory = require('../../../core/utils/handlerFactory');
// const sendEmail = require('../../../core/utils/_legacy/email');
// const { signToken } = require('../../../core/utils/authUtils');
// const { emitToOrg, emitToUser } = require('../../../core/utils/_legacy/socket'); // ✅ IMPORTED SOCKET UTILITIES
// const Shift = require('../../hr/shift/shift.model'); // 🟢 NEW: Import Shift Model

// /* -------------------------------------------------------------
//  * Utility: Generate Unique Shop ID
// ------------------------------------------------------------- */
// const generateUniqueShopId = () =>
//   `ORG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// /* -------------------------------------------------------------
//  * Create New Organization (Transactional)
// ------------------------------------------------------------- */
// exports.createOrganization = catchAsync(async (req, res, next) => {
//   const { 
//     organizationName, uniqueShopId, primaryEmail, primaryPhone, gstNumber, 
//     ownerName, ownerEmail, ownerPassword, 
//     mainBranchName, mainBranchAddress 
//   } = req.body;
  
//   if (!organizationName || !ownerName || !ownerEmail || !ownerPassword)
//     return next(new AppError('Missing required organization or owner fields', 400));

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const tempOrgId = new mongoose.Types.ObjectId();

//     // Step 1: Create the Owner (Initial Save)
//     const newUser = await new User({
//       name: ownerName,
//       email: ownerEmail,
//       password: ownerPassword,
//       organizationId: tempOrgId,
//       status: 'approved',
//       // Initialize Config (Shift will be added later)
//       attendanceConfig: {
//         isAttendanceEnabled: true,
//         allowWebPunch: true, // Owners usually need web punch
//         allowMobilePunch: true
//       }
//     }).save({ session });

//     // Step 2: Create Role (Super Admin)
//     const newRole = await new Role({
//       name: 'Super Admin',
//       organizationId: tempOrgId,
//       permissions: Role.allPermissions || [], 
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
//       // Default Preferences
//       whatsappWallet: { credits: 50 }, // Free credits
//       features: { whatsappEnabled: true }
//     }).save({ session });

//     // Step 4: Create Main Branch
//     const newBranch = await new Branch({
//       name: mainBranchName || 'Main Branch',
//       address: mainBranchAddress,
//       organizationId: newOrg._id,
//       isMainBranch: true,
//     }).save({ session });

//     // 🟢 STEP 4.5: Create Default Shift (CRITICAL FOR ATTENDANCE)
//     const defaultShift = await new Shift({
//         name: 'General Shift',
//         organizationId: newOrg._id,
//         startTime: '09:00',
//         endTime: '18:00',
//         gracePeriodMins: 15,
//         halfDayThresholdHrs: 4,
//         minFullDayHrs: 8,
//         weeklyOffs: [0], // Sunday
//         isActive: true
//     }).save({ session });

//     // Step 5: Link Everything & Update Owner
//     newOrg.mainBranch = newBranch._id;
//     newOrg.branches.push(newBranch._id);
//     newOrg.members.push(newUser._id);

//     // Update Owner Links
//     newUser.organizationId = newOrg._id;
//     newUser.branchId = newBranch._id;
//     newUser.role = newRole._id;
    
//     // 🟢 Assign the Default Shift to Owner
//     newUser.attendanceConfig.shiftId = defaultShift._id;

//     // Final Save
//     await Promise.all([newOrg.save({ session }), newUser.save({ session })]);
    
//     await session.commitTransaction();
    
//     // Fetch clean data for response
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
//       data: { 
//           organization: newOrg, 
//           owner: newUser, 
//           branch: newBranch, 
//           role: newRole,
//           shift: defaultShift // Return shift so frontend can update state
//       },
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
// ------------------------------------------------------------- */
// exports.getPendingMembers = catchAsync(async (req, res, next) => {
//   if (!req.user.organizationId) {
//     return next(new AppError('Not authorized to view pending members', 403));
//   }

//   // Directly query Users with status='pending' linked to this Org
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
// ------------------------------------------------------------- */
// exports.approveMember = catchAsync(async (req, res, next) => {
//   const { userId, roleId, branchId } = req.body;

//   if (!userId || !roleId || !branchId)
//     return next(new AppError("Missing required fields: userId, roleId, branchId", 400));

//   const org = await Organization.findById(req.user.organizationId);
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
//     // 1. Update User
//     user.status = "approved";
//     user.role = roleId;
//     user.branchId = branchId;

//     // 2. Add to Org Members (if not exists)
//     if (!org.members.includes(user._id)) {
//       org.members.push(user._id);
//     }

//     // ❌ REMOVED: Old 'approvalRequests' array logic (Prevents Crash)

//     await Promise.all([
//       user.save({ session }),
//       org.save({ session })
//     ]);

//     await session.commitTransaction();

//     // 3. Prepare Safe Response (Inject Permissions for UI)
//     const userResponse = user.toObject();
//     userResponse.permissions = role.permissions || [];
//     userResponse.role = role;

//     // 4. Send Real-time Notification to Org Admins
//     if (typeof emitToOrg === "function") {
//       emitToOrg(req.user.organizationId, "newNotification", {
//         title: "Member Approved",
//         message: `${user.name} has been approved.`,
//         type: "success",
//         createdAt: new Date()
//       });
//     }

//     // 5. Send Email Notification to User (Async - don't await)
//     try {
//       sendEmail({
//         email: user.email,
//         subject: "Account Approved",
//         message: `Congratulations ${user.name}, your account for ${org.name} has been approved. You can now log in.`,
//       });
//     } catch (emailErr) {
//       console.error("Failed to send approval email:", emailErr.message);
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
//  * Reject Member (With Email & Socket Notification)
// ------------------------------------------------------------- */
// exports.rejectMember = catchAsync(async (req, res, next) => {
//   const { userId } = req.body;
//   if (!userId) {
//     return next(new AppError("User ID is required", 400));
//   }
//   const user = await User.findOne({
//     _id: userId,
//     organizationId: req.user.organizationId,
//     status: "pending"
//   });

//   if (!user) {
//     return next(new AppError("Pending request not found.", 404));
//   }

//   const userEmail = user.email;
//   const userName = user.name;
//   const orgName = req.user.organizationName || "the organization"; // You might want to fetch Org Name if not in req.user

//   // 2. Send Notifications BEFORE Deletion
//   // We do this first because once deleted, the user object is gone.
  
//   // A. Socket Notification (If user happens to be connected with a temporary socket)
//   if (typeof emitToUser === "function") {
//     emitToUser(user._id, "accountRejected", {
//       message: "Your request to join the organization was declined.",
//       reason: "Admin decision"
//     });
//   }

//   // B. Email Notification
//   try {
//     await sendEmail({
//       email: userEmail,
//       subject: "Membership Request Declined",
//       message: `Hello ${userName},\n\nYour request to join ${orgName} has been declined by the administrator.\n\nIf you believe this is an error, please contact the administration directly.`,
//     });
//   } catch (emailErr) {
//     console.error(`Failed to send rejection email to ${userEmail}:`, emailErr.message);
//     // We continue with deletion even if email fails
//   }

//   // 3. Action: Delete the user document
//   // Since they were only 'pending', we remove the record entirely so they can signup again if needed.
//   await User.deleteOne({ _id: user._id });

//   // 4. Notify Admins (Real-time update to remove from list)
//   if (typeof emitToOrg === "function") {
//     emitToOrg(req.user.organizationId, "memberRejected", {
//       userId: userId,
//       message: `Request for ${userName} was rejected.`
//     });
//   }

//   res.status(200).json({
//     status: "success",
//     message: "Membership request rejected and user record removed."
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
//   req.params.id = req.user.organizationId;
//   return factory.deleteOne(Organization)(req, res, next);
// });


// /* -------------------------------------------------------------
//  * Platform-admin CRUD
// ------------------------------------------------------------- */
// exports.getAllOrganizations = factory.getAll(Organization);
// exports.getOrganization = factory.getOne(Organization, [
//   { path: 'owner', select: 'name email' },
//   { path: 'members', select: 'name email role' },
//   { path: 'branches', select: 'name city state' },
// ]);

// exports.updateOrganization = factory.updateOne(Organization);
// exports.deleteOrganization = factory.deleteOne(Organization);
