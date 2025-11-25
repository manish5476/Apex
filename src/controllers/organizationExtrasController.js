const User = require("../models/userModel");
const Organization = require("../models/organizationModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const ActivityLog = require("../models/activityLogModel");
const { logActivity } = require("../services/activityLogService");

// ======================================================
// TRANSFER OWNERSHIP
// PATCH /organization/transfer-ownership
// ======================================================
exports.transferOwnership = catchAsync(async (req, res, next) => {
  const { newOwnerId } = req.body;
  if (!newOwnerId)
    return next(new AppError("Provide newOwnerId", 400));
  const org = await Organization.findById(req.user.organizationId);
  if (!org) return next(new AppError("Organization not found", 404));
  // Only current org owner or superadmin can do this
  if (org.owner.toString() !== req.user.id && !req.user.role?.isSuperAdmin)
    return next(new AppError("You cannot transfer ownership.", 403));
  const user = await User.findById(newOwnerId);
  if (!user)
    return next(new AppError("New owner user not found.", 404));
  if (user.organizationId.toString() !== org._id.toString())
    return next(new AppError("User does not belong to this organization.", 400));
  org.owner = newOwnerId;
  await org.save();

  await logActivity(
    org._id,
    req.user.id,
    "TRANSFER_OWNERSHIP",
    `Ownership transferred to ${user.name}`,
    { newOwnerId }
  );

  res.status(200).json({
    status: "success",
    message: "Ownership transferred successfully.",
  });
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

