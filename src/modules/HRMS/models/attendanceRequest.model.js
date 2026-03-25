const mongoose = require('mongoose');

const attendanceRequestSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User',         required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },

  attendanceDailyId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDaily' },
  targetDate:        { type: Date, required: true },

  type: {
    type: String,
    enum: ['missed_punch', 'correction', 'work_from_home', 'on_duty', 'overtime', 'regularization', 'others'],
    required: true,
  },

  // --- Correction Details ---
  correction: {
    originalFirstIn:  Date,
    originalLastOut:  Date,
    newFirstIn:       Date,
    newLastOut:       Date,
    reason:           { type: String, required: true },
    supportingDocs: [{
      url:        String,
      fileName:   String,
      uploadedAt: Date,
    }],
    comments: String,
  },

  // --- Status & Approval Flow ---
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'cancelled', 'escalated'],
    default: 'pending',
    index: true,
  },

  approvalFlow: [{
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    level:    Number,
    status:   { type: String, enum: ['pending', 'approved', 'rejected'] },
    comments: String,
    actionAt: Date,
  }],

  currentApprovalLevel: { type: Number, default: 1 },

  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:      Date,
  rejectionReason: String,

  // --- Escalation ---
  escalatedAt:      Date,
  escalatedTo:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  escalationReason: String,

  // --- Audit ---
  appliedAt:   { type: Date, default: Date.now },
  appliedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date,

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────

// FIX BUG-AR-01 [CRITICAL] — MongoDB partialFilterExpression requires operator syntax.
// Original: `{ status: 'pending' }` — bare value match is NOT valid MongoDB partial filter syntax.
// This caused the partial index to silently not apply, allowing duplicate pending requests.
// Fix: Use `{ status: { $eq: 'pending' } }` — the correct operator form.
attendanceRequestSchema.index(
  { user: 1, targetDate: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $eq: 'pending' } }, // FIX
    name: 'unique_pending_request_per_user_date',
  }
);

// Org-level approvals dashboard
attendanceRequestSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

// Approver's inbox
attendanceRequestSchema.index({ approvedBy: 1, status: 1 });

// FIX BUG-AR-04 [MEDIUM] — Added index on user for user's own request history
attendanceRequestSchema.index({ user: 1, status: 1, createdAt: -1 });

// ─────────────────────────────────────────────
//  Pre-Validate
// ─────────────────────────────────────────────

attendanceRequestSchema.pre('validate', function (next) {
  // FIX BUG-AR-03 [HIGH] — Validate correction time logic.
  // Original had no guard: newLastOut could be before newFirstIn.
  if (this.correction) {
    const { newFirstIn, newLastOut } = this.correction;
    if (newFirstIn && newLastOut && newLastOut <= newFirstIn) {
      return next(new Error('Correction newLastOut must be after newFirstIn'));
    }
    // Also guard: corrected times must be on or near the targetDate
    if (newFirstIn && this.targetDate) {
      const targetDay = new Date(this.targetDate);
      targetDay.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDay);
      nextDay.setDate(nextDay.getDate() + 2); // Allow 1 day overflow for night shifts
      if (newFirstIn < targetDay || newFirstIn > nextDay) {
        return next(new Error('Correction newFirstIn must be on the targetDate'));
      }
    }
  }
  next();
});

// ─────────────────────────────────────────────
//  Methods
// ─────────────────────────────────────────────

/**
 * FIX BUG-AR-02 [HIGH] — Added status guard before approving.
 * Original: any status could be approved — rejected requests could be re-approved.
 */
attendanceRequestSchema.methods.approve = async function (approverId, comments) {
  // Guard: only pending or escalated requests can be approved
  if (!['pending', 'escalated'].includes(this.status)) {
    throw new Error(`Cannot approve a request with status '${this.status}'`);
  }

  this.status      = 'approved';
  this.approvedBy  = approverId;
  this.approvedAt  = new Date();
  this.processedBy = approverId;
  this.processedAt = new Date();

  this.approvalFlow.push({
    approver: approverId,
    level:    this.currentApprovalLevel,
    status:   'approved',
    comments,
    actionAt: new Date(),
  });

  await this.save();
};

/**
 * FIX BUG-AR-02 [HIGH] — Added status guard before rejecting.
 */
attendanceRequestSchema.methods.reject = async function (approverId, reason) {
  if (!['pending', 'escalated'].includes(this.status)) {
    throw new Error(`Cannot reject a request with status '${this.status}'`);
  }

  this.status          = 'rejected';
  this.rejectionReason = reason;
  this.processedBy     = approverId;
  this.processedAt     = new Date();

  this.approvalFlow.push({
    approver: approverId,
    level:    this.currentApprovalLevel,
    status:   'rejected',
    comments: reason,
    actionAt: new Date(),
  });

  await this.save();
};

module.exports = mongoose.model('AttendanceRequest', attendanceRequestSchema);
// const mongoose = require('mongoose');

// const attendanceRequestSchema = new mongoose.Schema({
//   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },

//   attendanceDailyId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDaily' },
//   targetDate: { type: Date, required: true },
  
//   type: { 
//     type: String, 
//     enum: ['missed_punch', 'correction', 'work_from_home', 'on_duty', 'overtime', 'regularization', 'others'], 
//     required: true 
//   },

//   // --- Correction Details ---
//   correction: {
//     originalFirstIn: Date,
//     originalLastOut: Date,
//     newFirstIn: Date,
//     newLastOut: Date,
//     reason: { type: String, required: true },
//     supportingDocs: [{
//       url: String,
//       fileName: String,
//       uploadedAt: Date
//     }],
//     comments: String
//   },

//   // --- Status & Approval Flow ---
//   status: { 
//     type: String, 
//     enum: ['draft', 'pending', 'approved', 'rejected', 'cancelled', 'escalated'], 
//     default: 'pending',
//     index: true 
//   },
  
//   approvalFlow: [{
//     approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//     level: Number,
//     status: { type: String, enum: ['pending', 'approved', 'rejected'] },
//     comments: String,
//     actionAt: Date
//   }],
  
//   currentApprovalLevel: { type: Number, default: 1 },
  
//   approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   approvedAt: Date,
//   rejectionReason: String,
  
//   // --- Escalation ---
//   escalatedAt: Date,
//   escalatedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   escalationReason: String,

//   // --- Audit ---
//   appliedAt: { type: Date, default: Date.now },
//   appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   processedAt: Date

// }, { timestamps: true });

// // --- INDEXES ---
// attendanceRequestSchema.index(
//   { user: 1, targetDate: 1, status: 1 }, 
//   { 
//     unique: true, 
//     partialFilterExpression: { status: 'pending' } 
//   }
// );
// attendanceRequestSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
// attendanceRequestSchema.index({ approvedBy: 1, status: 1 });

// // --- METHODS ---
// attendanceRequestSchema.methods.approve = async function(approverId, comments) {
//   this.status = 'approved';
//   this.approvedBy = approverId;
//   this.approvedAt = new Date();
//   this.processedBy = approverId;
//   this.processedAt = new Date();
  
//   // Update approval flow
//   this.approvalFlow.push({
//     approver: approverId,
//     level: this.currentApprovalLevel,
//     status: 'approved',
//     comments,
//     actionAt: new Date()
//   });
  
//   await this.save();
// };

// attendanceRequestSchema.methods.reject = async function(approverId, reason) {
//   this.status = 'rejected';
//   this.rejectionReason = reason;
//   this.processedBy = approverId;
//   this.processedAt = new Date();
  
//   this.approvalFlow.push({
//     approver: approverId,
//     level: this.currentApprovalLevel,
//     status: 'rejected',
//     comments: reason,
//     actionAt: new Date()
//   });
  
//   await this.save();
// };

// module.exports = mongoose.model('AttendanceRequest', attendanceRequestSchema);
