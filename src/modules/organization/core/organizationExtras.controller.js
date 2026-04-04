const User = require('../../auth/core/user.model');
const Organization = require('./organization.model');
const AppError = require('../../../core/utils/api/appError');
const catchAsync = require('../../../core/utils/api/catchAsync');
const ActivityLog = require('../../activity/activityLogModel');
const { logActivity } = require('../../activity/activityLogService');

// ======================================================
// INVITE USER
// POST /organization/invite
// ======================================================
/**
 * Invites a new user to the org.
 * A temporary password is auto-generated server-side — the admin never sets it.
 * The invited user must reset their password via the forgot-password flow on first login.
 */
exports.inviteUser = catchAsync(async (req, res, next) => {
  const { email, name, role, branchId } = req.body;
  const orgId = req.user.organizationId;

  if (!email || !name)
    return next(new AppError('Name and email are required.', 400));

  // Check for existing active user with this email
  const existing = await User.findOne({ email });
  if (existing && existing.status !== 'pending')
    return next(new AppError('A user with this email already exists and is active.', 400));

  // Auto-generate a temporary password — the user resets it on first login
  const tempPassword = require('crypto').randomBytes(16).toString('hex');

  const invitedUser = await User.create({
    name,
    email,
    password: tempPassword,
    mustChangePassword: true,
    role,
    branchId,
    organizationId: orgId,
    status: 'pending',
  });
  await logActivity(
    orgId,
    req.user.id,
    'INVITE_USER',
    `Invited ${email} (${name}) to join.`,
    { userId: invitedUser._id }
  );

  // Never expose password in response
  invitedUser.password = undefined;

  res.status(201).json({
    status: 'success',
    message: 'User invited successfully.',
    data: { invitedUser },
  });
});

// ======================================================
// REMOVE MEMBER
// DELETE /organization/members/:id
// ======================================================
exports.removeMember = catchAsync(async (req, res, next) => {
  const memberId = req.params.id;
  const orgId = req.user.organizationId;

  const org = await Organization.findById(orgId);
  if (!org) return next(new AppError('Organization not found', 404));

  const member = await User.findOne({ _id: memberId, organizationId: orgId });
  if (!member) return next(new AppError('User not found.', 404));

  if (org.owner.toString() === memberId)
    return next(new AppError('You cannot remove the owner.', 400));

  await User.findByIdAndUpdate(memberId, { status: 'inactive', isActive: false });

  await logActivity(
    orgId,
    req.user.id,
    'REMOVE_MEMBER',
    `Removed member ${member.name}`,
    { memberId }
  );

  res.status(200).json({
    status: 'success',
    message: 'Member removed successfully.',
  });
});

// ======================================================
// ACTIVITY LOG
// GET /organization/activity-log
// ======================================================
exports.getActivityLog = catchAsync(async (req, res, next) => {
  const logs = await ActivityLog.find({ organizationId: req.user.organizationId })
    .populate('userId', 'name email')
    .sort({ createdAt: -1 })
    .limit(100);

  res.status(200).json({
    status: 'success',
    results: logs.length,
    data: { logs },
  });
});