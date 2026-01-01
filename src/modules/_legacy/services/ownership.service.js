// services/ownership.service.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const TransferRequest = require('../models/TransferRequest');
const Organization = require('../models/Organization'); // Your Org Model
const User = require('../models/User'); // Your User Model
const EmailService = require('./email.service'); // Your Email logic

class OwnershipService {

  /**
   * STEP 1: INITIATE TRANSFER
   */
  async initiateTransfer(currentUserId, orgId, newOwnerEmail) {
    // 1. Validation
    const org = await Organization.findOne({ _id: orgId, owner: currentUserId });
    if (!org) throw new Error('Organization not found or you are not the owner');

    const targetUser = await User.findOne({ email: newOwnerEmail });
    if (!targetUser) throw new Error('Target user does not exist');
    if (targetUser._id.equals(currentUserId)) throw new Error('Cannot transfer to yourself');

    // 2. Check for existing pending requests to prevent spam
    const existing = await TransferRequest.findOne({
      resourceId: orgId,
      status: 'pending'
    });
    if (existing) throw new Error('A transfer request is already pending');

    // 3. Generate Secure Token
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // 4. Create Request Record
    await TransferRequest.create({
      targetResource: 'Organization',
      resourceId: orgId,
      currentOwner: currentUserId,
      newOwner: targetUser._id,
      token: hashedToken // Store hash, send raw token to user
    });

    // 5. Send Email (Send the RAW token, not the hash)
    // Link format: https://app.apex-infinity.com/accept-ownership?token=...
    await EmailService.sendOwnershipTransferEmail(targetUser.email, token, org.name);

    return { message: 'Transfer initiated. Waiting for acceptance.' };
  }

  /**
   * STEP 2: COMPLETE TRANSFER (Atomic Transaction)
   */
  async completeTransfer(rawToken, action) {
    // 1. Hash token to match DB
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const request = await TransferRequest.findOne({
      token: hashedToken,
      status: 'pending'
    }).select('+token');

    if (!request) throw new Error('Invalid or expired transfer link');

    // REJECT FLOW
    if (action === 'reject') {
      await TransferRequest.deleteOne({ _id: request._id });
      return { message: 'Transfer request rejected' };
    }

    // ACCEPT FLOW - START TRANSACTION
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // A. Update Organization Owner
      const org = await Organization.findById(request.resourceId).session(session);

      // OPTIONAL: Downgrade old owner to "Admin" instead of removing them completely
      // Assuming you have a `members` array with roles
      const oldOwnerId = org.owner;

      org.owner = request.newOwner; // Set new owner

      // Ensure new owner is in members list with admin role if not already
      // Logic depends on your specific Schema design

      await org.save({ session });

      // B. Update Request Status
      request.status = 'completed';
      await request.save({ session });

      // C. Commit Transaction
      await session.commitTransaction();
      session.endSession();

      // D. Notify Old Owner (Non-blocking)
      const oldUser = await User.findById(request.currentOwner);
      EmailService.sendTransferSuccessEmail(oldUser.email, org.name);

      return { success: true, message: 'Ownership transferred successfully' };

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}

module.exports = new OwnershipService();