const User = require("../../auth/core/user.model");
const Organization = require("./organization.model");
const AppError = require("../../../core/utils/appError");
const catchAsync = require("../../../core/utils/catchAsync");
const ActivityLog = require("../../_legacy/models/activityLogModel");
const { logActivity } = require("../../_legacy/services/activityLogService");
const mongoose = require("mongoose"); // ✅ Added
const Role = require("../../auth/core/role.model"); // ✅ Added


exports.transferOwnership = catchAsync(async (req, res, next) => {
  const newOwnerId = req.body.user?._id || req.body.user;
  
  const currentOwnerId = req.user.id;
  const orgId = req.user.organizationId;

  if (!newOwnerId) return next(new AppError("Provide user ID to transfer ownership.", 400));

  // 1. Start Transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 2. Fetch Organization
    const org = await Organization.findById(orgId).session(session);
    if (!org) throw new AppError("Organization not found", 404);

    // 3. Security Check: Only current owner can transfer
    if (org.owner.toString() !== currentOwnerId) {
      throw new AppError("Only the current owner can transfer ownership.", 403);
    }

    // 4. Validate New Owner
    const newOwner = await User.findOne({ 
      _id: newOwnerId, 
      organizationId: orgId 
    }).session(session);

    if (!newOwner) throw new AppError("New owner not found in this organization.", 404);

    // 5. Fetch Roles (Super Admin vs Admin)
    const superAdminRole = await Role.findOne({ organizationId: orgId, isSuperAdmin: true }).session(session);
    
    // Find a fallback role for the old owner (Admin or Default)
    let downgradeRole = await Role.findOne({ organizationId: orgId, name: 'Admin' }).session(session);
    if (!downgradeRole) {
      downgradeRole = await Role.findOne({ organizationId: orgId, isDefault: true }).session(session);
    }

    if (!superAdminRole || !downgradeRole) {
      throw new AppError("Required roles (Super Admin / Admin) missing. Cannot transfer.", 500);
    }

    // ======================================================
    // EXECUTE SWAP
    // ======================================================
    
    // A. Promote New Owner (Give Super Admin Role)
    newOwner.role = superAdminRole._id;
    await newOwner.save({ session });

    // B. Demote Old Owner (Give Admin/Member Role)
    await User.findByIdAndUpdate(currentOwnerId, { role: downgradeRole._id }, { session });

    // C. Update Organization Record
    org.owner = newOwnerId;
    await org.save({ session });

    // 6. Log Activity
    await logActivity(
      orgId,
      currentOwnerId,
      "TRANSFER_OWNERSHIP",
      `Ownership transferred to ${newOwner.name} (ID: ${newOwnerId})`,
      { previousOwner: currentOwnerId, newOwner: newOwnerId }
    );

    // 7. Commit Transaction
    await session.commitTransaction();

    res.status(200).json({
      status: "success",
      message: `Ownership transferred to ${newOwner.name}. You are now an Admin.`,
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});
// ======================================================
// INVITE USER
// POST /organization/invite
// ======================================================
exports.inviteUser = catchAsync(async (req, res, next) => {
  const { email, name, role, branchId } = req.body;

  if (!email || !name)
    return next(new AppError("Name and email are required.", 400));

  const orgId = req.user.organizationId;

  const existing = await User.findOne({ email });
  if (existing && existing.status !== "pending")
    return next(new AppError("Email already in use.", 400));

  const invitedUser = await User.create({
    name,
    email,
    role,
    branchId,
    organizationId: orgId,
    status: "pending",
  });

  await logActivity(
    orgId,
    req.user.id,
    "INVITE_USER",
    `Invited ${email} (${name}) to join.`,
    { userId: invitedUser._id }
  );

  res.status(201).json({
    status: "success",
    message: "User invited successfully.",
    data: { invitedUser },
  });
});


// ======================================================
// REMOVE MEMBER
// DELETE /organization/members/:id
// ======================================================
exports.removeMember = catchAsync(async (req, res, next) => {
  const memberId = req.params.id;

  const org = await Organization.findById(req.user.organizationId);
  if (!org) return next(new AppError("Organization not found", 404));

  const member = await User.findOne({
    _id: memberId,
    organizationId: req.user.organizationId,
  });

  if (!member)
    return next(new AppError("User not found.", 404));

  // Prevent removing organization owner
  if (org.owner.toString() === memberId)
    return next(new AppError("You cannot remove the owner.", 400));

  await User.findByIdAndUpdate(memberId, {
    status: "inactive",
    isActive: false,
  });

  await logActivity(
    req.user.organizationId,
    req.user.id,
    "REMOVE_MEMBER",
    `Removed member ${member.name}`,
    { memberId }
  );

  res.status(200).json({
    status: "success",
    message: "Member removed successfully.",
  });
});


// ======================================================
// ACTIVITY LOG LIST
// GET /organization/activity-log
// ======================================================
exports.getActivityLog = catchAsync(async (req, res, next) => {
  const logs = await ActivityLog.find({
    organizationId: req.user.organizationId,
  })
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .limit(100);

  res.status(200).json({
    status: "success",
    results: logs.length,
    data: { logs },
  });
});

