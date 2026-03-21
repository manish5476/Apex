const mongoose = require('mongoose');

const attendanceRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },

  attendanceDailyId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDaily' },
  targetDate: { type: Date, required: true },
  
  type: { 
    type: String, 
    enum: ['missed_punch', 'correction', 'work_from_home', 'on_duty', 'overtime', 'regularization', 'others'], 
    required: true 
  },

  // --- Correction Details ---
  correction: {
    originalFirstIn: Date,
    originalLastOut: Date,
    newFirstIn: Date,
    newLastOut: Date,
    reason: { type: String, required: true },
    supportingDocs: [{
      url: String,
      fileName: String,
      uploadedAt: Date
    }],
    comments: String
  },

  // --- Status & Approval Flow ---
  status: { 
    type: String, 
    enum: ['draft', 'pending', 'approved', 'rejected', 'cancelled', 'escalated'], 
    default: 'pending',
    index: true 
  },
  
  approvalFlow: [{
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    level: Number,
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    comments: String,
    actionAt: Date
  }],
  
  currentApprovalLevel: { type: Number, default: 1 },
  
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String,
  
  // --- Escalation ---
  escalatedAt: Date,
  escalatedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  escalationReason: String,

  // --- Audit ---
  appliedAt: { type: Date, default: Date.now },
  appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date

}, { timestamps: true });

// --- INDEXES ---
attendanceRequestSchema.index(
  { user: 1, targetDate: 1, status: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { status: 'pending' } 
  }
);
attendanceRequestSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
attendanceRequestSchema.index({ approvedBy: 1, status: 1 });

// --- METHODS ---
attendanceRequestSchema.methods.approve = async function(approverId, comments) {
  this.status = 'approved';
  this.approvedBy = approverId;
  this.approvedAt = new Date();
  this.processedBy = approverId;
  this.processedAt = new Date();
  
  // Update approval flow
  this.approvalFlow.push({
    approver: approverId,
    level: this.currentApprovalLevel,
    status: 'approved',
    comments,
    actionAt: new Date()
  });
  
  await this.save();
};

attendanceRequestSchema.methods.reject = async function(approverId, reason) {
  this.status = 'rejected';
  this.rejectionReason = reason;
  this.processedBy = approverId;
  this.processedAt = new Date();
  
  this.approvalFlow.push({
    approver: approverId,
    level: this.currentApprovalLevel,
    status: 'rejected',
    comments: reason,
    actionAt: new Date()
  });
  
  await this.save();
};

module.exports = mongoose.model('AttendanceRequest', attendanceRequestSchema);
// const mongoose = require('mongoose');

// const attendanceRequestSchema = new mongoose.Schema({
//   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
//   targetDate: { type: String, required: true },
//   type: { type: String, enum: ['missed_punch', 'correction', 'work_from_home', 'on_duty', 'others'], required: true },
  
//   correction: {
//     newFirstIn: Date,
//     newLastOut: Date,
//     reason: { type: String, required: true },
//     supportingDocs: [String]
//   },
  
//   status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
//   approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   approvedAt: Date,
//   rejectionReason: String,
// }, { timestamps: true });

// attendanceRequestSchema.index({ user: 1, targetDate: 1, status: 1 }, { 
//   unique: true, 
//   partialFilterExpression: { status: { $in: ['pending'] } } 
// });

// module.exports = mongoose.model('AttendanceRequest', attendanceRequestSchema);