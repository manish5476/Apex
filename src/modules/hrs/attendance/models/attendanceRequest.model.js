const mongoose = require('mongoose');

const attendanceRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  // Request details
  targetDate: { type: String, required: true }, // "YYYY-MM-DD"
  type: {
    type: String,
    enum: ['missed_punch', 'correction', 'work_from_home', 'on_duty', 'leave_reversal', 'others'],
    required: true
  },
  
  // Correction data
  correction: {
    newFirstIn: Date,
    newLastOut: Date,
    reason: { type: String, required: true, minlength: 10, maxlength: 500 },
    supportingDocs: [String] // URLs to uploaded documents
  },
  
  // Workflow
  status: {
    type: String,
    enum: ['draft', 'pending', 'under_review', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  
  // Approval chain
  approvers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    comments: String,
    actedAt: Date
  }],
  
  currentApproverLevel: { type: Number, default: 1 },
  approvalRequired: { type: Number, default: 1 }, // How many approvals needed
  
  // Final action
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String,
  
  // Notifications
  notifications: {
    userNotifiedAt: Date,
    approversNotifiedAt: Date,
    completedNotifiedAt: Date
  },
  
  // Audit
  history: [{
    action: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: String,
    timestamp: { type: Date, default: Date.now },
    oldStatus: String,
    newStatus: String
  }],
  
  // Metadata
  urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  tags: [String],
  
}, { timestamps: true });

// Prevent duplicate pending requests
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

// For manager dashboards
attendanceRequestSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
attendanceRequestSchema.index({ branchId: 1, status: 1 });

module.exports = mongoose.model('AttendanceRequest', attendanceRequestSchema);
