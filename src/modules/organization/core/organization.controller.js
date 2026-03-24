const mongoose = require('mongoose');
const crypto = require('crypto');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const factory = require('../../../core/utils/api/handlerFactory');
const sendEmail = require('../../../core/infra/email');
const { signToken, signAccessToken, signRefreshToken } = require('../../../core/utils/helpers/authUtils');
const Organization = require('./organization.model');
const Branch = require('./branch.model');
const User = require('../../auth/core/user.model');
const Role = require('../../auth/core/role.model');
const Shift = require('../../HRMS/models/shift.model');
const LeaveBalance = require('../../HRMS/models/leaveBalance.model');
const Department = require('../../HRMS/models/department.model');
const Designation = require('../../HRMS/models/designation.model');
const { emitToOrg, emitToUser } = require('../../../socketHandlers/socket');
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

    // 6. Create Department
    const defaultDept = new Department({
      _id: deptId,
      name: 'Administration',
      organizationId: orgId,
      branchId: branchId,
      headOfDepartment: ownerId
    });

    // 7. Create Designation
    const defaultDesig = new Designation({
      _id: desigId,
      title: 'Director',
      organizationId: orgId,
      level: 10 // Top level
    });

    // 8. Create Owner (First Employee)
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

    // 9. Create Leave Balance for Owner
    const leaveBalance = new LeaveBalance({
      user: ownerId,
      organizationId: orgId,
      financialYear: getFinancialYear(),
      casualLeave: { total: 12, used: 0 },
      sickLeave: { total: 10, used: 0 },
      earnedLeave: { total: 15, used: 0 }
    });

    // 10. Save Everything (SEQUENTIALLY to prevent Mongoose Transaction Errors)
    await newOrg.save({ session });
    await newBranch.save({ session });
    await newRole.save({ session });
    await defaultShift.save({ session });
    await defaultDept.save({ session });
    await defaultDesig.save({ session });
    await newOwner.save({ session });
    await leaveBalance.save({ session });

    // 11. Commit Transaction
    await session.commitTransaction();

    // 12. Response Data
    const token = signToken(newOwner._id);
    newOwner.password = undefined;

    const accessToken = signAccessToken(newOwner);
    const refreshToken = signRefreshToken(newOwner);

    // Hide password before sending response
    newOwner.password = undefined;

    res.status(201).json({
      status: 'success',
      message: 'Organization set up successfully!',
      token: accessToken, // Sending accessToken as 'token' for backward compatibility with your frontend
      refreshToken,       // Sending the new refresh token
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
    // res.status(201).json({
    //   status: 'success',
    //   message: 'Organization set up successfully!',
    //   token,
    //   data: { 
    //     organization: newOrg, 
    //     owner: newOwner, 
    //     setup: {
    //       branch: newBranch.name,
    //       role: newRole.name,
    //       shift: defaultShift.name,
    //       department: defaultDept.name,
    //       designation: defaultDesig.name
    //     }
    //   },
    // });

  } catch (err) {
    // Safely attempt to abort the transaction in case it was already dropped by MongoDB
    try {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
    } catch (abortErr) {
      console.log('Transaction already aborted by server:', abortErr.message);
    }

    // Improved error handling
    if (err.code === 11000) {
      if (err.keyPattern?.uniqueShopId)
        return next(new AppError('This Shop ID is already taken. Please try another.', 400));
      if (err.keyPattern?.email)
        return next(new AppError('This email is already registered.', 400));
    }

    next(err);
  } finally {
    await session.endSession();
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
/**
 * 🟡 PUBLIC: Verify Shop ID exists (for login screen)
 */
exports.getOrganizationByShopId = catchAsync(async (req, res, next) => {
  const { uniqueShopId } = req.params;

  const org = await Organization.findOne({
    uniqueShopId: uniqueShopId.toUpperCase(),
    isActive: true
  }).select('name logo uniqueShopId primaryEmail');

  if (!org) {
    return next(new AppError('No organization found with that Shop ID.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: org
  });
});

/**
 * 🟡 PUBLIC: Secure Lookup by Email
 * Finds all orgs for a user and sends them an email (security best practice)
 */
exports.lookupOrganizations = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError('Please provide an email address.', 400));

  // Find all users with this email (User can belong to multiple Orgs)
  const users = await User.find({ email: email.toLowerCase() })
    .populate('organizationId', 'name uniqueShopId isActive');

  if (users && users.length > 0) {
    // Extract unique active organizations
    const orgs = users
      .filter(u => u.organizationId && u.organizationId.isActive)
      .map(u => ({
        name: u.organizationId.name,
        shopId: u.organizationId.uniqueShopId
      }));

    // Deduplicate (in case user has multiple roles in same org, though unlikely)
    const uniqueOrgs = Array.from(new Set(orgs.map(o => o.shopId)))
      .map(id => orgs.find(o => o.shopId === id));

    if (uniqueOrgs.length > 0) {
      const orgListHtml = uniqueOrgs
        .map(o => `<li><strong>${o.name}</strong> (Shop ID: <code style="background: #f4f4f4; padding: 2px 5px; border-radius: 3px;">${o.shopId}</code>)</li>`)
        .join('');

      await sendEmail({
        email: email.toLowerCase(),
        subject: 'Find My Organization Request - Apex CRM',
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #f1c40f; padding-bottom: 10px;">Organization Details Found</h2>
            <p>Hello,</p>
            <p>You requested a list of organizations associated with this email address. Here are the organizations we found:</p>
            <ul style="list-style: none; padding: 0;">
              ${orgListHtml}
            </ul>
            <p style="margin-top: 20px;">You can use these <strong>Shop IDs</strong> to log in at the portal.</p>
            <p style="color: #7f8c8d; font-size: 0.9em;">If you didn't request this lookup, please ignore this email.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;"/>
            <p style="font-size: 0.8em; text-align: center; color: #bdc3c7;">&copy; ${new Date().getFullYear()} Apex CRM. All rights reserved.</p>
          </div>
        `
      });
    }
  }

  // SECURITY: Always return success to prevent user enumeration
  res.status(200).json({
    status: 'success',
    message: 'If an account is associated with this email, you will receive an email with your organization details shortly.'
  });
});

/**
 * 🟢 Self-service: Update own organization
 */
exports.updateMyOrganization = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;

  if (!orgId) {
    return next(new AppError("You are not linked to any organization.", 400));
  }

  // Ownership Check: Sensitive updates usually restricted to Org Owner
  // (Assuming req.user.isOwner is populated by auth middleware)
  if (!req.user.isOwner && (req.body.uniqueShopId || req.body.gstNumber)) {
    return next(new AppError("Only the organization owner can change the unique Shop ID or GST number.", 403));
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

  // 2. Process Nested Address safely (Dot Notation for Mongo)
  if (req.body.address && typeof req.body.address === 'object') {
    const addressFields = ["street", "city", "state", "zipCode", "country"];
    addressFields.forEach(field => {
      if (req.body.address[field] !== undefined) {
        updates[`address.${field}`] = req.body.address[field];
      }
    });
  }

  // 3. Process Nested Settings
  if (req.body.settings && typeof req.body.settings === 'object') {
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
    { $set: updates },
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



