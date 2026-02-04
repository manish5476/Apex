const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
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
  
  // Leave Details
  leaveType: {
    type: String,
    enum: ['casual', 'sick', 'earned', 'maternity', 'paternity', 'bereavement', 'unpaid', 'compensatory'],
    required: true
  },
  
  // Date Range
  startDate: { 
    type: String, // YYYY-MM-DD
    required: true,
    index: true 
  },
  endDate: { 
    type: String, // YYYY-MM-DD
    required: true 
  },
  
  // Half Day Support
  isHalfDay: { type: Boolean, default: false },
  halfDayType: { 
    type: String, 
    enum: ['first_half', 'second_half', null],
    default: null 
  },
  
  // Duration
  daysCount: { 
    type: Number, 
    required: true,
    min: 0.5,
    max: 90 
  },
  
  // Details
  reason: { 
    type: String, 
    required: true,
    minlength: 10,
    maxlength: 1000 
  },
  contactDuringLeave: String,
  handoverTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  supportingDocs: [String], // URLs to uploaded documents
  
  // Status & Workflow
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'cancelled', 'recalled'],
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
    order: Number
  }],
  
  currentApprover: { type: Number, default: 0 },
  approvalRequired: { type: Number, default: 1 },
  
  // Final Action
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  
  // Impact Tracking
  impactedDates: [String], // Dates affected by this leave
  attendanceOverrideIds: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceDaily' 
  }],
  
  // Leave Balance Tracking
  leaveBalanceBefore: Number,
  leaveBalanceAfter: Number,
  
  // Notifications
  notifications: {
    appliedAt: Date,
    approvedAt: Date,
    rejectedAt: Date,
    managerNotifiedAt: Date
  },
  
  // Audit Trail
  history: [{
    action: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: String,
    timestamp: { type: Date, default: Date.now },
    oldStatus: String,
    newStatus: String
  }],
  
  // Metadata
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  tags: [String],
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
leaveRequestSchema.index({ user: 1, startDate: 1, status: 1 });
leaveRequestSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
leaveRequestSchema.index({ 'approvers.user': 1, status: 1 });

// Virtuals
leaveRequestSchema.virtual('duration').get(function() {
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
});

leaveRequestSchema.virtual('isActive').get(function() {
  const today = new Date().toISOString().split('T')[0];
  return this.status === 'approved' && 
         this.startDate <= today && 
         this.endDate >= today;
});

// Pre-save middleware
leaveRequestSchema.pre('save', async function(next) {
  if (this.isModified('startDate') || this.isModified('endDate')) {
    // Validate date order
    if (new Date(this.startDate) > new Date(this.endDate)) {
      return next(new Error('Start date cannot be after end date'));
    }
    
    // Calculate impacted dates
    this.impactedDates = this.calculateImpactedDates();
  }
  
  // Auto-calculate days count for full days
  if (!this.daysCount && this.startDate && this.endDate) {
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    this.daysCount = this.isHalfDay ? diffDays * 0.5 : diffDays + 1;
  }
  
  next();
});

// Instance method to calculate impacted dates
leaveRequestSchema.methods.calculateImpactedDates = function() {
  const dates = [];
  let current = new Date(this.startDate);
  const end = new Date(this.endDate);
  
  while (current <= end) {
    // Skip weekends if configured
    const dayOfWeek = current.getDay();
    const shouldSkip = dayOfWeek === 0 || dayOfWeek === 6; // Saturday/Sunday
    
    if (!shouldSkip) {
      dates.push(current.toISOString().split('T')[0]);
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
};

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);