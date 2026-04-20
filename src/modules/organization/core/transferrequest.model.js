const mongoose = require('mongoose');
const crypto = require('crypto');

const transferRequestSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  currentOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  newOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tokenHash: {
    type: String,
    required: true,
    select: false, // never accidentally leak the hash in queries
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  // MongoDB TTL index: auto-deletes the document after expiresAt
  // This acts as the hard expiry enforcement at the DB level.
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    index: { expireAfterSeconds: 0 },
  },
}, { timestamps: true });

// Compound index: fast lookup for "is there a pending request for this org?"
transferRequestSchema.index({ organizationId: 1, status: 1 });

// Method to verify token
transferRequestSchema.methods.correctToken = function (candidateToken) {
  const hashedCandidate = crypto.createHash('sha256').update(candidateToken).digest('hex');
  return hashedCandidate === this.tokenHash;
};

const TransferRequest = mongoose.model('TransferRequest', transferRequestSchema);
module.exports = TransferRequest;