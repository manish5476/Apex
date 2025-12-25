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

// // models/TransferRequest.js
// const mongoose = require('mongoose');

// const transferSchema = new mongoose.Schema({
//   targetResource: {
//     type: String,
//     required: true,
//     enum: ['Organization', 'Project'] // Extensible
//   },
//   resourceId: {
//     type: mongoose.Schema.Types.ObjectId,
//     refPath: 'targetResource',
//     required: true
//   },
//   currentOwner: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   newOwner: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   token: {
//     type: String,
//     required: true,
//     select: false // Security: Don't return this in queries by default
//   },
//   status: {
//     type: String,
//     enum: ['pending', 'completed', 'expired'],
//     default: 'pending'
//   },
//   expiresAt: {
//     type: Date,
//     default: () => Date.now() + 24 * 60 * 60 * 1000 // 24 Hours
//   }
// });

// // Auto-delete document after expiry (TTL Index)
// transferSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// module.exports = mongoose.model('TransferRequest', transferSchema);