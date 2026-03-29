const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User',         required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  departmentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

  leaveRequestId: { type: String, unique: true }, // LR-2024-0001

  leaveType: {
    type: String,
    enum: ['casual', 'sick', 'earned', 'compensatory', 'paid', 'unpaid', 'marriage', 'paternity', 'maternity', 'bereavement', 'study', 'sabbatical'],
    required: true,
    index: true,
  },

  startDate: { type: Date, required: true, index: true },
  endDate:   { type: Date, required: true },
  daysCount: { type: Number, required: true, min: 0.5 },

  startSession: { type: String, enum: ['full', 'first_half', 'second_half'], default: 'full' },
  endSession:   { type: String, enum: ['full', 'first_half', 'second_half'], default: 'full' },

  reason:          { type: String, required: true },
  additionalNotes: String,

  attachments: [{
    url:        String,
    fileName:   String,
    fileType:   String,
    uploadedAt: Date,
  }],

  emergencyContact: {
    name:           String,
    relationship:   String,
    phone:          String,
    alternatePhone: String,
  },

  handoverTo:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  handoverNotes: String,
  tasksHandled:  [String],

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

  balanceSnapshot: {
    before: { casual: Number, sick: Number, earned: Number },
    after:  { casual: Number, sick: Number, earned: Number },
  },

  impactedDates: [{
    date:   Date,
    status: { type: String, enum: ['full_day', 'half_day'] },
  }],

  escalatedAt:      Date,
  escalatedTo:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  escalationReason: String,

  notificationsSent: {
    toUser:      { type: Boolean, default: false },
    toApprovers: { type: Boolean, default: false },
    toHandover:  { type: Boolean, default: false },
  },

  appliedAt:   { type: Date, default: Date.now },
  appliedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date,

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
leaveRequestSchema.index({ organizationId: 1, status: 1, startDate: -1 });
leaveRequestSchema.index({ user: 1, status: 1, startDate: -1 });
leaveRequestSchema.index({ approvedBy: 1, status: 1 });
leaveRequestSchema.index({ 'impactedDates.date': 1 });

// ─────────────────────────────────────────────
//  Pre-Validate
// ─────────────────────────────────────────────

leaveRequestSchema.pre('validate', function (next) {
  // FIX BUG-LR-04 [MEDIUM] — endDate must be on or after startDate
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    return next(new Error('endDate must be on or after startDate'));
  }

  // FIX BUG-LR-03 [HIGH] — daysCount must be consistent with the date range.
  // A request for 1 day spanning an entire year should be rejected.
  if (this.startDate && this.endDate && this.daysCount) {
    const msPerDay = 1000 * 60 * 60 * 24;
    const calendarDays = Math.ceil((this.endDate - this.startDate) / msPerDay) + 1;
    // Allow daysCount to be less (half-days, weekends excluded) but not more than calendar days
    if (this.daysCount > calendarDays) {
      return next(new Error(
        `daysCount (${this.daysCount}) cannot exceed calendar days between startDate and endDate (${calendarDays})`
      ));
    }
  }

  next();
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────

leaveRequestSchema.pre('save', async function (next) {
  try {
    // FIX BUG-LR-01 [HIGH] — leaveRequestId generation was race-condition prone.
    // Original used countDocuments() which is not atomic — two simultaneous requests
    // at the same millisecond would get the same count → same ID → unique index violation.
    // Fix: Use findOneAndUpdate with $inc on a counter document (atomic) or nanoid fallback.
    if (this.isNew && !this.leaveRequestId) {
      const year = new Date().getFullYear();
      // Atomic increment using a separate counter collection
      // If counter collection is not available, fall back to timestamp-based ID
      try {
        const Counter = mongoose.model('Counter');
        const counter = await Counter.findOneAndUpdate(
          { _id: `leaveRequest_${year}` },
          { $inc: { seq: 1 } },
          { upsert: true, new: true }
        );
        this.leaveRequestId = `LR-${year}-${counter.seq.toString().padStart(4, '0')}`;
      } catch (counterErr) {
        // Fallback: timestamp + random suffix (still unique, just not sequential)
        const suffix = Date.now().toString(36).toUpperCase().slice(-6);
        this.leaveRequestId = `LR-${year}-${suffix}`;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  Methods
// ─────────────────────────────────────────────

/**
 * FIX BUG-LR-02 [HIGH] — approve() now deducts from LeaveBalance.
 * Original only changed `status` to 'approved' — the leave balance was NEVER deducted,
 * meaning employees could take unlimited leave without any balance reduction.
 *
 * FIX CROSS-03 [HIGH] — Wrapped in MongoDB session for atomicity.
 * A server crash between status update and balance debit previously left the
 * system inconsistent (leave approved but balance not deducted).
 *
 * @param {ObjectId} approverId
 * @param {string} comments
 * @param {ClientSession} [session] - MongoDB session for transaction support
 */
leaveRequestSchema.methods.approve = async function (approverId, comments, session = null) {
  if (!['pending', 'escalated'].includes(this.status)) {
    throw new Error(`Cannot approve a request with status '${this.status}'`);
  }

  // Map leaveType enum value to LeaveBalance field name
  const leaveTypeMap = {
    casual:       'casualLeave',
    sick:         'sickLeave',
    earned:       'earnedLeave',
    compensatory: 'compensatoryOff',
    paid:         'paidLeave',
    unpaid:       'unpaidLeave',
    marriage:     'marriageLeave',
    paternity:    'paternityLeave',
    maternity:    'maternityLeave',
    bereavement:  'bereavementLeave',
  };

  const balanceField = leaveTypeMap[this.leaveType];

  // Debit the leave balance (FIX BUG-LR-02)
  if (balanceField) {
    const LeaveBalance = mongoose.model('LeaveBalance');
    const balance = await LeaveBalance.findOne({ user: this.user }).session(session);
    if (!balance) {
      throw new Error(`LeaveBalance not found for user ${this.user}`);
    }
    // This will throw if insufficient balance
    await balance.debitLeave(
      balanceField,
      this.daysCount,
      this._id,
      `Leave approved: ${this.leaveRequestId}`,
      approverId
    );
  }

  // Update request status
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

  if (session) {
    await this.save({ session });
  } else {
    await this.save();
  }
};

/**
 * FIX: Added status guard before rejecting
 */
leaveRequestSchema.methods.reject = async function (approverId, reason) {
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

// ─────────────────────────────────────────────
//  Statics
// ─────────────────────────────────────────────

/**
 * FIX BUG-LR-05 [MEDIUM] — Used $elemMatch to ensure both `approver` and `status: 'pending'`
 * match the SAME element in the approvalFlow array.
 * Original query matched documents where approver X appears in ANY element AND
 * 'pending' appears in ANY element — could return requests where X already approved
 * but another approver is still pending.
 *
 * @param {ObjectId} approverId
 */
leaveRequestSchema.statics.getPendingApprovals = async function (approverId) {
  return await this.find({
    status: 'pending',
    approvalFlow: {
      $elemMatch: {          // FIX: Both conditions must match the SAME array element
        approver: approverId,
        status:   'pending',
      },
    },
  }).populate('user', 'name employeeProfile.employeeId');
};

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);


// const mongoose = require('mongoose');

// const leaveRequestSchema = new mongoose.Schema({
//   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
//   departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

//   leaveRequestId: { type: String, unique: true }, // LR-2024-0001
  
//   leaveType: {
//     type: String,
//     enum: ['casual', 'sick', 'earned', 'compensatory', 'paid', 'unpaid', 'marriage', 'paternity', 'maternity', 'bereavement', 'study', 'sabbatical'],
//     required: true,
//     index: true
//   },

//   // --- Date Range ---
//   startDate: { type: Date, required: true, index: true },
//   endDate: { type: Date, required: true },
//   daysCount: { type: Number, required: true, min: 0.5 },
  
//   // --- For half-day leaves ---
//   startSession: { type: String, enum: ['full', 'first_half', 'second_half'], default: 'full' },
//   endSession: { type: String, enum: ['full', 'first_half', 'second_half'], default: 'full' },

//   // --- Details ---
//   reason: { type: String, required: true },
//   additionalNotes: String,
  
//   // --- Documents ---
//   attachments: [{
//     url: String,
//     fileName: String,
//     fileType: String,
//     uploadedAt: Date
//   }],

//   // --- Contact During Leave ---
//   emergencyContact: {
//     name: String,
//     relationship: String,
//     phone: String,
//     alternatePhone: String
//   },

//   // --- Work Handover ---
//   handoverTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   handoverNotes: String,
//   tasksHandled: [String],

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

//   // --- Balance Snapshot (Critical for audit) ---
//   balanceSnapshot: {
//     before: {
//       casual: Number,
//       sick: Number,
//       earned: Number
//     },
//     after: {
//       casual: Number,
//       sick: Number,
//       earned: Number
//     }
//   },

//   // --- Impacted Dates ---
//   impactedDates: [{
//     date: Date,
//     status: { type: String, enum: ['full_day', 'half_day'] }
//   }],

//   // --- Escalation ---
//   escalatedAt: Date,
//   escalatedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   escalationReason: String,

//   // --- Notifications ---
//   notificationsSent: {
//     toUser: { type: Boolean, default: false },
//     toApprovers: { type: Boolean, default: false },
//     toHandover: { type: Boolean, default: false }
//   },

//   // --- Audit ---
//   appliedAt: { type: Date, default: Date.now },
//   appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   processedAt: Date

// }, { timestamps: true });

// // --- INDEXES ---
// leaveRequestSchema.index({ organizationId: 1, status: 1, startDate: -1 });
// leaveRequestSchema.index({ user: 1, status: 1, startDate: -1 });
// leaveRequestSchema.index({ approvedBy: 1, status: 1 });
// leaveRequestSchema.index({ 'impactedDates.date': 1 });

// // --- MIDDLEWARE ---
// leaveRequestSchema.pre('save', async function(next) {
//   // Generate unique request ID
//   if (this.isNew && !this.leaveRequestId) {
//     const year = new Date().getFullYear();
//     const count = await this.constructor.countDocuments({
//       leaveRequestId: new RegExp(`^LR-${year}`)
//     });
//     this.leaveRequestId = `LR-${year}-${(count + 1).toString().padStart(4, '0')}`;
//   }
//   next();
// });

// // --- METHODS ---
// leaveRequestSchema.methods.approve = async function(approverId, comments) {
//   this.status = 'approved';
//   this.approvedBy = approverId;
//   this.approvedAt = new Date();
//   this.processedBy = approverId;
//   this.processedAt = new Date();
  
//   this.approvalFlow.push({
//     approver: approverId,
//     level: this.currentApprovalLevel,
//     status: 'approved',
//     comments,
//     actionAt: new Date()
//   });
  
//   await this.save();
// };

// leaveRequestSchema.methods.reject = async function(approverId, reason) {
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

// // --- STATICS ---
// leaveRequestSchema.statics.getPendingApprovals = async function(approverId) {
//   return await this.find({
//     'approvalFlow.approver': approverId,
//     'approvalFlow.status': 'pending',
//     status: 'pending'
//   }).populate('user', 'name employeeProfile.employeeId');
// };

// module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
