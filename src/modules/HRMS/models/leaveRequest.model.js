const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

  leaveRequestId: { type: String, unique: true }, // LR-2024-0001
  
  leaveType: {
    type: String,
    enum: ['casual', 'sick', 'earned', 'compensatory', 'paid', 'unpaid', 'marriage', 'paternity', 'maternity', 'bereavement', 'study', 'sabbatical'],
    required: true,
    index: true
  },

  // --- Date Range ---
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true },
  daysCount: { type: Number, required: true, min: 0.5 },
  
  // --- For half-day leaves ---
  startSession: { type: String, enum: ['full', 'first_half', 'second_half'], default: 'full' },
  endSession: { type: String, enum: ['full', 'first_half', 'second_half'], default: 'full' },

  // --- Details ---
  reason: { type: String, required: true },
  additionalNotes: String,
  
  // --- Documents ---
  attachments: [{
    url: String,
    fileName: String,
    fileType: String,
    uploadedAt: Date
  }],

  // --- Contact During Leave ---
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String,
    alternatePhone: String
  },

  // --- Work Handover ---
  handoverTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  handoverNotes: String,
  tasksHandled: [String],

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

  // --- Balance Snapshot (Critical for audit) ---
  balanceSnapshot: {
    before: {
      casual: Number,
      sick: Number,
      earned: Number
    },
    after: {
      casual: Number,
      sick: Number,
      earned: Number
    }
  },

  // --- Impacted Dates ---
  impactedDates: [{
    date: Date,
    status: { type: String, enum: ['full_day', 'half_day'] }
  }],

  // --- Escalation ---
  escalatedAt: Date,
  escalatedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  escalationReason: String,

  // --- Notifications ---
  notificationsSent: {
    toUser: { type: Boolean, default: false },
    toApprovers: { type: Boolean, default: false },
    toHandover: { type: Boolean, default: false }
  },

  // --- Audit ---
  appliedAt: { type: Date, default: Date.now },
  appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date

}, { timestamps: true });

// --- INDEXES ---
leaveRequestSchema.index({ organizationId: 1, status: 1, startDate: -1 });
leaveRequestSchema.index({ user: 1, status: 1, startDate: -1 });
leaveRequestSchema.index({ approvedBy: 1, status: 1 });
leaveRequestSchema.index({ 'impactedDates.date': 1 });

// --- MIDDLEWARE ---
leaveRequestSchema.pre('save', async function(next) {
  // Generate unique request ID
  if (this.isNew && !this.leaveRequestId) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments({
      leaveRequestId: new RegExp(`^LR-${year}`)
    });
    this.leaveRequestId = `LR-${year}-${(count + 1).toString().padStart(4, '0')}`;
  }
  next();
});

// --- METHODS ---
leaveRequestSchema.methods.approve = async function(approverId, comments) {
  this.status = 'approved';
  this.approvedBy = approverId;
  this.approvedAt = new Date();
  this.processedBy = approverId;
  this.processedAt = new Date();
  
  this.approvalFlow.push({
    approver: approverId,
    level: this.currentApprovalLevel,
    status: 'approved',
    comments,
    actionAt: new Date()
  });
  
  await this.save();
};

leaveRequestSchema.methods.reject = async function(approverId, reason) {
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

// --- STATICS ---
leaveRequestSchema.statics.getPendingApprovals = async function(approverId) {
  return await this.find({
    'approvalFlow.approver': approverId,
    'approvalFlow.status': 'pending',
    status: 'pending'
  }).populate('user', 'name employeeProfile.employeeId');
};

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
