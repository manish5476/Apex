// models/transferRequestModel.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const transferSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  currentOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  newOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'expired'],
    default: 'pending'
  },
  tokenHash: {
    type: String,
    required: true,
    select: false // Never return this in queries
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Auto-delete document after 24 hours (MongoDB TTL)
  }
});

// Method to verify token
transferSchema.methods.correctToken = function(candidateToken) {
  const hashedCandidate = crypto.createHash('sha256').update(candidateToken).digest('hex');
  return hashedCandidate === this.tokenHash;
};

module.exports = mongoose.model('TransferRequest', transferSchema);
