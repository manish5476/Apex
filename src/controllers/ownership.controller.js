const mongoose = require('mongoose');
const crypto = require('crypto');
const Organization = require('../models/organizationModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const sendEmail = require('../utils/email');
const { signToken } = require('../utils/authUtils');
const { emitToOrg, emitToUser } = require('../utils/socket'); // ✅ IMPORTED SOCKET UTILITIES
const TransferRequest = require('../models/TransferRequest');


// ======================================================
// STEP 1: INITIATE TRANSFER
// POST /api/v1/organization/ownership/initiate
// ======================================================

exports.initiateOwnershipTransfer = catchAsync(async (req, res, next) => {
  const newOwnerId = req.body.userId;
  const currentOwnerId = req.user.id;
  const orgId = req.user.organizationId;

  // 1. Validation
  if (!newOwnerId) return next(new AppError("Please provide the User ID of the new owner.", 400));
  
  if (newOwnerId === currentOwnerId) {
    return next(new AppError("You are already the owner.", 400));
  }

  const org = await Organization.findById(orgId);
  if (!org || org.owner.toString() !== currentOwnerId) {
    return next(new AppError("Only the current owner can initiate a transfer.", 403));
  }

  const newOwner = await User.findOne({ _id: newOwnerId, organizationId: orgId });
  if (!newOwner) return next(new AppError("Target user not found in this organization.", 404));

  // 2. Check for existing pending requests (Anti-Spam)
  const existingRequest = await TransferRequest.findOne({ 
    organizationId: orgId, 
    status: 'pending' 
  });
  
  if (existingRequest) {
    return next(new AppError("A transfer request is already pending. Cancel it first.", 400));
  }

  // 3. Generate Secure Token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  // 4. Save Request
  await TransferRequest.create({
    organizationId: orgId,
    currentOwner: currentOwnerId,
    newOwner: newOwnerId,
    tokenHash: tokenHash
  });

  // 5. Send Email
  // ⚠️ CRITICAL CHANGE: Use your Angular URL (e.g., localhost:4200), NOT req.get('host')
  const clientUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const transferLink = `${clientUrl}/dashboard/settings/ownership?token=${resetToken}`;
  
  try {
    // ✅ FIXED: Call sendEmail directly (no .sendEmail property)
    await sendEmail({
      email: newOwner.email, 
      subject: 'Action Required: Accept Organization Ownership',
      message: `You have been nominated to become the owner of ${org.name}.\n\nPlease click the link below to accept or reject this transfer:\n\n${transferLink}\n\nThis link expires in 24 hours.`
    });
  } catch (err) {
    await TransferRequest.findOneAndDelete({ tokenHash });
    console.error("Ownership Email Failed:", err);
    return next(new AppError("Email failed to send. Transfer aborted.", 500));
  }

  res.status(200).json({
    status: "success",
    message: "Transfer initiated. Approval email sent to the new owner."
  });
});

// ... (imports remain the same)

/* ======================================================
   STEP 2: FINALIZE TRANSFER (Atomic Swap)
   POST /api/v1/organization/ownership/finalize
   ====================================================== */
exports.finalizeOwnershipTransfer = catchAsync(async (req, res, next) => {
  const { token, action } = req.body; 
  
  if (!token) return next(new AppError("Token is required.", 400));

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const request = await TransferRequest.findOne({ 
    tokenHash: hashedToken, 
    status: 'pending' 
  }).select('+tokenHash');

  if (!request) return next(new AppError("Link is invalid or has expired.", 400));

  // Security: Ensure the person clicking is the intended target
  if (req.user.id !== request.newOwner.toString()) {
     return next(new AppError("You are not the intended recipient.", 403));
  }

  if (action === 'reject') {
    await TransferRequest.findByIdAndDelete(request._id);
    return res.status(200).json({ status: "success", message: "Ownership transfer rejected." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orgId = request.organizationId;
    
    // 1. Fetch New Owner Details (Need Email/Phone for Org Update)
    const newOwnerUser = await User.findById(request.newOwner).session(session);
    if (!newOwnerUser) throw new AppError("New owner user not found.", 404);

    // 2. Fetch Roles
    const superAdminRole = await Role.findOne({ organizationId: orgId, isSuperAdmin: true }).session(session);
    let downgradeRole = await Role.findOne({ organizationId: orgId, name: { $regex: /Admin/i } }).session(session);
    
    if (!downgradeRole) {
      downgradeRole = await Role.findOne({ organizationId: orgId, isDefault: true }).session(session);
    }

    if (!superAdminRole || !downgradeRole) throw new AppError("System Error: Cannot determine roles.", 500);

    // 3. Perform Role Swap
    await User.findByIdAndUpdate(request.newOwner, { role: superAdminRole._id }, { session });
    await User.findByIdAndUpdate(request.currentOwner, { role: downgradeRole._id }, { session });

    // 4. Update Organization (Owner + Contact Info)
    // ✅ Logic: Update primaryEmail always. Update phone ONLY if user has one (to avoid validation errors).
    const orgUpdates = { 
      owner: request.newOwner,
      primaryEmail: newOwnerUser.email 
    };
    if (newOwnerUser.phone) orgUpdates.primaryPhone = newOwnerUser.phone;

    await Organization.findByIdAndUpdate(orgId, orgUpdates, { session });

    // 5. Complete Request
    request.status = 'completed';
    await request.save({ session });

    await session.commitTransaction();

    // Notify Org Members
    emitToOrg(orgId, "ownershipTransferred", {
      message: `Ownership transferred to ${newOwnerUser.name}.`,
      newOwnerId: request.newOwner
    });

    res.status(200).json({
      status: "success",
      message: "Ownership transferred successfully. Contact details updated."
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

/* ======================================================
   STEP 3: FORCE TRANSFER (Instant, No Email Required)
   POST /api/v1/organization/ownership/force
   ====================================================== */
exports.forceTransferOwnership = catchAsync(async (req, res, next) => {
  const { newOwnerId } = req.body;
  const currentOwnerId = req.user.id;
  const orgId = req.user.organizationId;
  if (!newOwnerId) return next(new AppError("New Owner ID is required.", 400));
  if (newOwnerId === currentOwnerId) return next(new AppError("You are already the owner.", 400));
  const org = await Organization.findById(orgId);
  if (!org || org.owner.toString() !== currentOwnerId) {
    return next(new AppError("Only the Organization Owner can force a transfer.", 403));
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const newOwnerUser = await User.findOne({ _id: newOwnerId, organizationId: orgId }).session(session);
    if (!newOwnerUser) throw new AppError("Target user not found.", 404);
    const superAdminRole = await Role.findOne({ organizationId: orgId, isSuperAdmin: true }).session(session);
    let downgradeRole = await Role.findOne({ organizationId: orgId, name: { $regex: /Admin/i } }).session(session);
    if (!downgradeRole) {
      downgradeRole = await Role.findOne({ organizationId: orgId, isDefault: true }).session(session);
    }
    if (!superAdminRole || !downgradeRole) throw new AppError("System Error: Cannot determine roles.", 500);    await User.findByIdAndUpdate(newOwnerId, { role: superAdminRole._id }, { session });
    await User.findByIdAndUpdate(currentOwnerId, { role: downgradeRole._id }, { session });
    const orgUpdates = { 
      owner: newOwnerId,
      primaryEmail: newOwnerUser.email 
    };
    if (newOwnerUser.phone) orgUpdates.primaryPhone = newOwnerUser.phone;
    await Organization.findByIdAndUpdate(orgId, orgUpdates, { session });
    await TransferRequest.deleteMany({ organizationId: orgId }, { session });
    await session.commitTransaction();
    try {
      await sendEmail({
        email: newOwnerUser.email,
        subject: 'Organization Ownership Transferred',
        message: `You have been assigned as the new owner of ${org.name}.`
      });
    } catch (err) {
      console.error("Force Transfer Email Failed:", err.message);
    }
    res.status(200).json({
      status: "success",
      message: "Ownership successfully transferred and contact info updated."
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

// // ======================================================
// // STEP 2: FINALIZE TRANSFER (Atomic Swap)
// // POST /api/v1/organization/ownership/finalize
// // ======================================================
// exports.finalizeOwnershipTransfer = catchAsync(async (req, res, next) => {
//   const { token, action } = req.body; // action = 'accept' or 'reject'
  
//   if (!token) return next(new AppError("Token is required.", 400));

//   const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

//   const request = await TransferRequest.findOne({ 
//     tokenHash: hashedToken, 
//     status: 'pending' 
//   }).select('+tokenHash');


//   // Debugging Logs (Remove in production if desired)
// console.log(`🔹 Logged In User: ${req.user.id}`);
// console.log(`🔹 Intended New Owner: ${request.newOwner.toString()}`);

// // Security Check
// if (req.user.id !== request.newOwner.toString()) {
//    return next(new AppError(`You are logged in as ${req.user.name}, but this transfer is for a different user. Please logout and login as the correct user.`, 403));
// }
//   if (!request) return next(new AppError("Link is invalid or has expired.", 400));

//   // Security: Ensure the person clicking is the intended target
//   if (req.user.id !== request.newOwner.toString()) {
//      return next(new AppError("You are not the intended recipient.", 403));
//   }

//   // Handle Rejection
//   if (action === 'reject') {
//     await TransferRequest.findByIdAndDelete(request._id);
//     return res.status(200).json({ status: "success", message: "Ownership transfer rejected." });
//   }


//   // Handle Acceptance (Atomic Transaction)
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const orgId = request.organizationId;
    
//     // A. Fetch Roles (Super Admin & Default/Admin)
//     const superAdminRole = await Role.findOne({ organizationId: orgId, isSuperAdmin: true }).session(session);
    
//     // Fallback role for the OLD owner (try to find 'Admin', else default)
//     let downgradeRole = await Role.findOne({ 
//       organizationId: orgId, 
//       name: { $regex: /Admin/i } 
//     }).session(session);

//     if (!downgradeRole) {
//       downgradeRole = await Role.findOne({ organizationId: orgId, isDefault: true }).session(session);
//     }

//     if (!superAdminRole || !downgradeRole) {
//       throw new AppError("System Error: Cannot determine roles for swap.", 500);
//     }

//     // B. Perform the Swap
//     // 1. Promote New Owner
//     await User.findByIdAndUpdate(request.newOwner, { role: superAdminRole._id }, { session });

//     // 2. Demote Old Owner
//     await User.findByIdAndUpdate(request.currentOwner, { role: downgradeRole._id }, { session });

//     // 3. Update Organization Reference
//     await Organization.findByIdAndUpdate(orgId, { owner: request.newOwner }, { session });

//     // 4. Complete Request
//     request.status = 'completed';
//     await request.save({ session });

//     await session.commitTransaction();

//     res.status(200).json({
//       status: "success",
//       message: "Ownership transferred successfully. You are now the Super Admin."
//     });

//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });



// /* ======================================================
//    STEP 3: FORCE TRANSFER (Instant, No Email Required)
//    POST /api/v1/organization/ownership/force
//    ====================================================== */
// exports.forceTransferOwnership = catchAsync(async (req, res, next) => {
//   const { newOwnerId } = req.body; // Pass the target User ID
//   const currentOwnerId = req.user.id;
//   const orgId = req.user.organizationId;

//   // 1. Validation
//   if (!newOwnerId) return next(new AppError("New Owner ID is required.", 400));
//   if (newOwnerId === currentOwnerId) return next(new AppError("You are already the owner.", 400));

//   // Ensure ONLY the actual owner can do this (Extra safety)
//   const org = await Organization.findById(orgId);
//   if (!org || org.owner.toString() !== currentOwnerId) {
//     return next(new AppError("Only the Organization Owner can force a transfer.", 403));
//   }

//   const newOwner = await User.findOne({ _id: newOwnerId, organizationId: orgId });
//   if (!newOwner) return next(new AppError("Target user not found in this organization.", 404));

//   // 2. Start Transaction
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // A. Fetch Roles
//     const superAdminRole = await Role.findOne({ organizationId: orgId, isSuperAdmin: true }).session(session);
    
//     // Find fallback role for YOU (the old owner)
//     let downgradeRole = await Role.findOne({ 
//       organizationId: orgId, 
//       name: { $regex: /Admin/i } 
//     }).session(session);

//     if (!downgradeRole) {
//       downgradeRole = await Role.findOne({ organizationId: orgId, isDefault: true }).session(session);
//     }

//     if (!superAdminRole || !downgradeRole) {
//       throw new AppError("System Error: Cannot determine roles for swap.", 500);
//     }

//     // B. Perform the Swap
//     // 1. Promote New Owner -> Super Admin
//     await User.findByIdAndUpdate(newOwnerId, { role: superAdminRole._id }, { session });

//     // 2. Demote You (Old Owner) -> Admin/Member
//     await User.findByIdAndUpdate(currentOwnerId, { role: downgradeRole._id }, { session });

//     // 3. Update Organization Owner Reference
//     await Organization.findByIdAndUpdate(orgId, { owner: newOwnerId }, { session });

//     // 4. Cleanup: Remove any pending Transfer Requests to avoid confusion
//     await TransferRequest.deleteMany({ organizationId: orgId }, { session });

//     await session.commitTransaction();

//     // C. Notify the new owner via Email (Informational only)
//     try {
//       await sendEmail({
//         email: newOwner.email,
//         subject: 'Organization Ownership Transferred',
//         message: `You have been assigned as the new owner of ${org.name} by the previous owner. You now have Super Admin privileges.`
//       });
//     } catch (err) {
//       console.error("Force Transfer Email Failed:", err.message);
//     }

//     res.status(200).json({
//       status: "success",
//       message: "Ownership successfully transferred. You are no longer the owner."
//     });

//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

/* ======================================================
   STEP 4: CANCEL TRANSFER
   POST /api/v1/organization/ownership/cancel
   ====================================================== */
exports.cancelOwnershipTransfer = catchAsync(async (req, res, next) => {
  const currentOwnerId = req.user.id;
  const orgId = req.user.organizationId;

  // 1. Find the pending request
  const request = await TransferRequest.findOne({
    organizationId: orgId,
    status: 'pending'
  });

  if (!request) {
    return next(new AppError("No pending transfer request found.", 404));
  }

  // 2. Security Check: Only the initiator (Current Owner) can cancel
  if (request.currentOwner.toString() !== currentOwnerId) {
    return next(new AppError("You are not authorized to cancel this request.", 403));
  }

  // 3. Action: Delete the request
  await TransferRequest.findByIdAndDelete(request._id);

  res.status(200).json({
    status: "success",
    message: "Ownership transfer request cancelled successfully."
  });
});