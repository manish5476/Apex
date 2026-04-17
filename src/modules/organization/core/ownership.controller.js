const mongoose = require('mongoose');
const crypto = require('crypto');
const Organization = require('./organization.model');
const Branch = require('./branch.model');
const User = require('../../auth/core/user.model');
const Role = require('../../auth/core/role.model');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const sendEmail = require('../../../core/infra/email');
const { emitToOrg } = require('../../../socketHandlers/socket');
const TransferRequest = require('./transferrequest.model');

/* ---------------------------------------------------------------
 * Helper: resolve super-admin + fallback-admin roles for an org
--------------------------------------------------------------- */
async function resolveRoles(orgId, session) {
  const superAdminRole = await Role.findOne({ organizationId: orgId, isSuperAdmin: true }).session(session);
  let downgradeRole = await Role.findOne({ organizationId: orgId, name: { $regex: /Admin/i } }).session(session);
  if (!downgradeRole)
    downgradeRole = await Role.findOne({ organizationId: orgId, isDefault: true }).session(session);

  if (!superAdminRole || !downgradeRole)
    throw new AppError('System Error: Cannot determine roles for transfer.', 500);

  return { superAdminRole, downgradeRole };
}

/* ======================================================
   STEP 1: INITIATE TRANSFER
   POST /ownership/initiate
   (protected + checkIsOwner + PERMISSIONS.OWNERSHIP.TRANSFER)
   ====================================================== */
exports.initiateOwnershipTransfer = catchAsync(async (req, res, next) => {
  const newOwnerId = req.body.userId;
  const currentOwnerId = req.user.id;
  const orgId = req.user.organizationId;

  if (!newOwnerId)
    return next(new AppError('Please provide the User ID of the new owner.', 400));

  if (newOwnerId === currentOwnerId)
    return next(new AppError('You are already the owner.', 400));

  const org = await Organization.findById(orgId);
  if (!org || org.owner.toString() !== currentOwnerId)
    return next(new AppError('Only the current owner can initiate a transfer.', 403));

  const newOwner = await User.findOne({ _id: newOwnerId, organizationId: orgId });
  if (!newOwner)
    return next(new AppError('Target user not found in this organization.', 404));

  // Anti-spam: only one pending request per org
  const existingRequest = await TransferRequest.findOne({ organizationId: orgId, status: 'pending' });
  if (existingRequest)
    return next(new AppError('A transfer request is already pending. Cancel it first.', 400));

  // Hash: store hash in DB, send raw token to user
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

  await TransferRequest.create({
    organizationId: orgId,
    currentOwner: currentOwnerId,
    newOwner: newOwnerId,
    tokenHash,
    expiresAt,
    status: 'pending',
  });

  const clientUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const transferLink = `${clientUrl}/dashboard/settings/ownership?token=${rawToken}`;

  try {
    await sendEmail({
      email: newOwner.email,
      subject: 'Action Required: Accept Organization Ownership',
      message:
        `You have been nominated to become the owner of "${org.name}".\n\n` +
        `Click the link below to accept or reject this transfer:\n\n${transferLink}\n\n` +
        `This link expires in 24 hours.`,
    });
  } catch (err) {
    // Clean up the request so they can retry
    await TransferRequest.findOneAndDelete({ tokenHash });
    console.error('Ownership email failed:', err);
    return next(new AppError('Email failed to send. Transfer aborted.', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'Transfer initiated. Approval email sent to the new owner.',
  });
});

/* ======================================================
   STEP 2: FINALIZE TRANSFER (Atomic Swap)
   POST /ownership/finalize
   (protected + PERMISSIONS.OWNERSHIP.TRANSFER)
   ====================================================== */
exports.finalizeOwnershipTransfer = catchAsync(async (req, res, next) => {
  const { token, action } = req.body;
  if (!token) return next(new AppError('Token is required.', 400));

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const request = await TransferRequest.findOne({ tokenHash: hashedToken, status: 'pending' });
  if (!request) return next(new AppError('Link is invalid or has expired.', 400));

  // Enforce token expiry
  if (request.expiresAt && request.expiresAt < new Date()) {
    await request.deleteOne();
    return next(new AppError('Transfer link has expired. Please ask the owner to initiate a new one.', 400));
  }

  // Only the intended recipient can finalize
  if (req.user.id !== request.newOwner.toString())
    return next(new AppError('You are not the intended recipient of this transfer.', 403));

  if (action === 'reject') {
    await TransferRequest.findByIdAndDelete(request._id);
    return res.status(200).json({ status: 'success', message: 'Ownership transfer rejected.' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orgId = request.organizationId;
    const { superAdminRole, downgradeRole } = await resolveRoles(orgId, session);

    // Swap roles
    await User.findByIdAndUpdate(request.newOwner, { role: superAdminRole._id }, { session });
    await User.findByIdAndUpdate(request.currentOwner, { role: downgradeRole._id }, { session });

    // Update org owner ONLY — do NOT overwrite primaryEmail/primaryPhone.
    // The org's billing contact is independent of who owns the account.
    await Organization.findByIdAndUpdate(orgId, { owner: request.newOwner }, { session });

    // Mark request complete
    request.status = 'completed';
    await request.save({ session });

    await session.commitTransaction();

    emitToOrg(orgId, 'ownershipTransferred', {
      message: `Ownership transferred to ${req.user.name}.`,
      newOwnerId: request.newOwner,
    });

    res.status(200).json({
      status: 'success',
      message: 'Ownership transferred successfully.',
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

/* ======================================================
   STEP 3: FORCE TRANSFER (Instant, no email confirmation)
   POST /ownership/force
   (protected + checkIsOwner + PERMISSIONS.OWNERSHIP.TRANSFER)
   ====================================================== */
exports.forceTransferOwnership = catchAsync(async (req, res, next) => {
  const { newOwnerId } = req.body;
  const currentOwnerId = req.user.id;
  const orgId = req.user.organizationId;

  if (!newOwnerId) return next(new AppError('New Owner ID is required.', 400));
  if (newOwnerId === currentOwnerId) return next(new AppError('You are already the owner.', 400));

  const org = await Organization.findById(orgId);
  if (!org || org.owner.toString() !== currentOwnerId)
    return next(new AppError('Only the Organization Owner can force a transfer.', 403));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const newOwnerUser = await User.findOne({ _id: newOwnerId, organizationId: orgId }).session(session);
    if (!newOwnerUser) throw new AppError('Target user not found in this organization.', 404);

    const { superAdminRole, downgradeRole } = await resolveRoles(orgId, session);

    // Swap roles
    await User.findByIdAndUpdate(newOwnerId, { role: superAdminRole._id }, { session });
    await User.findByIdAndUpdate(currentOwnerId, { role: downgradeRole._id }, { session });

    // Update org owner ONLY — do NOT overwrite org contact info
    await Organization.findByIdAndUpdate(orgId, { owner: newOwnerId }, { session });

    // Cancel any pending transfer requests for this org
    await TransferRequest.deleteMany({ organizationId: orgId }, { session });

    await session.commitTransaction();

    // Non-blocking notification email
    sendEmail({
      email: newOwnerUser.email,
      subject: 'Organization Ownership Transferred',
      message: `You have been assigned as the new owner of "${org.name}".`,
    }).catch(err => console.error('Force transfer email failed:', err.message));

    res.status(200).json({
      status: 'success',
      message: 'Ownership successfully transferred.',
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

/* ======================================================
   STEP 4: CANCEL TRANSFER
   POST /ownership/cancel
   (protected + checkIsOwner + PERMISSIONS.OWNERSHIP.TRANSFER)
   ====================================================== */
exports.cancelOwnershipTransfer = catchAsync(async (req, res, next) => {
  const currentOwnerId = req.user.id;
  const orgId = req.user.organizationId;

  const request = await TransferRequest.findOne({ organizationId: orgId, status: 'pending' });
  if (!request) return next(new AppError('No pending transfer request found.', 404));

  // Only the initiator (current owner) can cancel
  if (request.currentOwner.toString() !== currentOwnerId)
    return next(new AppError('You are not authorized to cancel this request.', 403));

  await TransferRequest.findByIdAndDelete(request._id);

  res.status(200).json({
    status: 'success',
    message: 'Ownership transfer request cancelled successfully.',
  });
});
