const mongoose = require('mongoose');

const attendanceRequestSchema = new mongoose.Schema({
  // Basic Information
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true,
    index: true 
  },
  branchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch',
    index: true 
  },
  
  // Request Details
  targetDate: { 
    type: String, // YYYY-MM-DD
    required: true,
    index: true 
  },
  type: {
    type: String,
    enum: ['missed_punch', 'correction', 'work_from_home', 'on_duty', 'leave_reversal', 'others'],
    required: true,
    index: true
  },
  subtype: {
    type: String,
    enum: ['in_missed', 'out_missed', 'both_missed', 'time_correction', 'date_correction', null],
    default: null
  },
  
  // Correction Details
  correction: {
    newFirstIn: Date,
    newLastOut: Date,
    newDate: String, // For date correction
    reason: { 
      type: String, 
      required: true,
      minlength: 10,
      maxlength: 500 
    },
    supportingDocs: [String], // URLs to uploaded documents
    oldFirstIn: Date, // For audit
    oldLastOut: Date // For audit
  },
  
  // Status & Workflow
  status: {
    type: String,
    enum: ['draft', 'pending', 'under_review', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // Approval Chain
  approvers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: String,
    status: { 
      type: String, 
      enum: ['pending', 'approved', 'rejected', 'forwarded'] 
    },
    comments: String,
    actedAt: Date,
    order: Number,
    isMandatory: { type: Boolean, default: true }
  }],
  
  currentApproverLevel: { type: Number, default: 0 },
  approvalRequired: { type: Number, default: 1 },
  
  // Final Action
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  
  // Priority & Tags
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'], 
    default: 'medium',
    index: true 
  },
  tags: [String],
  
  // SLA Tracking
  slaDueDate: Date,
  responseTime: Number, // In hours
  isOverdue: { type: Boolean, default: false },
  
  // Notifications
  notifications: {
    userNotifiedAt: Date,
    approversNotifiedAt: Date,
    completedNotifiedAt: Date
  },
  
  // Audit Trail
  history: [{
    action: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: String,
    timestamp: { type: Date, default: Date.now },
    oldStatus: String,
    newStatus: String,
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  // Linked Records
  linkedAttendanceIds: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceDaily' 
  }],
  linkedLogIds: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceLog' 
  }],
  
  // Metadata
  source: { 
    type: String, 
    enum: ['web', 'mobile', 'admin', 'api'], 
    default: 'web' 
  },
  ipAddress: String,
  userAgent: String,
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
attendanceRequestSchema.index({ 
  user: 1, 
  targetDate: 1, 
  status: 1 
}, { 
  unique: true, 
  partialFilterExpression: { 
    status: { $in: ['draft', 'pending', 'under_review'] } 
  } 
});

attendanceRequestSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
attendanceRequestSchema.index({ branchId: 1, status: 1, createdAt: -1 });
attendanceRequestSchema.index({ 'approvers.user': 1, status: 1 });
attendanceRequestSchema.index({ priority: 1, createdAt: -1 });
attendanceRequestSchema.index({ slaDueDate: 1, isOverdue: 1 });

// Virtuals
attendanceRequestSchema.virtual('isExpired').get(function() {
  if (!this.slaDueDate) return false;
  return new Date() > this.slaDueDate && this.status === 'pending';
});

attendanceRequestSchema.virtual('timeSinceCreation').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60)); // Hours
});

// Pre-save middleware
attendanceRequestSchema.pre('save', function(next) {
  // Set SLA due date (e.g., 48 hours from creation)
  if (!this.slaDueDate && this.status === 'pending') {
    this.slaDueDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
  }
  
  // Check if overdue
  if (this.slaDueDate && this.status === 'pending') {
    this.isOverdue = new Date() > this.slaDueDate;
  }
  
  // Calculate response time if approved/rejected
  if ((this.status === 'approved' || this.status === 'rejected') && !this.responseTime) {
    this.responseTime = Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60)); // Hours
  }
  
  next();
});

// Instance method to add to history
attendanceRequestSchema.methods.addHistory = function(action, user, remarks, metadata = {}) {
  this.history.push({
    action,
    by: user._id || user,
    remarks,
    oldStatus: this.status,
    newStatus: this.status, // Status might change after this
    metadata
  });
};

// Static method to get pending requests count
attendanceRequestSchema.statics.getPendingCount = async function(organizationId, userId = null) {
  const filter = {
    organizationId,
    status: { $in: ['pending', 'under_review'] }
  };
  
  if (userId) {
    filter['approvers.user'] = userId;
    filter['approvers.status'] = 'pending';
  }
  
  return await this.countDocuments(filter);
};

module.exports = mongoose.model('AttendanceRequest', attendanceRequestSchema);