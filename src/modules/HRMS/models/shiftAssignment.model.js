const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
//  ShiftAssignment Model
// ═══════════════════════════════════════════════════════════

const shiftAssignmentSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User',         required: true, index: true },
  // FIX BUG-SA-03 [MEDIUM] — Added index to organizationId (was missing)
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  shiftId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Shift',        required: true },
  shiftGroupId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftGroup' },

  startDate: { type: Date, required: true, index: true },
  endDate:   Date, // null = ongoing

  isTemporary: { type: Boolean, default: false },

  rotationSequence: Number,
  rotationEndDate:  Date,

  overrides: {
    startTime:       String,
    endTime:         String,
    breakDuration:   Number,
    weeklyOffs:      [Number],
  },

  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active',
    index: true,
  },

  reason: String,

  assignedBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedAt:          { type: Date, default: Date.now },
  cancelledBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledAt:         Date,
  cancellationReason:  String,

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
shiftAssignmentSchema.index({ user: 1, status: 1, startDate: -1 });
shiftAssignmentSchema.index({ organizationId: 1, shiftId: 1, status: 1 });
shiftAssignmentSchema.index({ endDate: 1 }, { sparse: true });

// ─────────────────────────────────────────────
//  Pre-Validate
// ─────────────────────────────────────────────

// FIX BUG-SA-02 [MEDIUM] — Validate startDate < endDate
shiftAssignmentSchema.pre('validate', function (next) {
  if (this.endDate && this.startDate && this.endDate < this.startDate) {
    return next(new Error('ShiftAssignment endDate must be on or after startDate'));
  }
  next();
});

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────

// FIX BUG-SA-01 [HIGH] — isActive virtual documented: uses server UTC time.
// In production, compare against org timezone using a timezone library (e.g. luxon).
shiftAssignmentSchema.virtual('isActiveNow').get(function () {
  const now = new Date(); // UTC — ensure server TZ is UTC in production
  return (
    this.status === 'active' &&
    this.startDate <= now &&
    (!this.endDate || this.endDate >= now)
  );
});

// ─────────────────────────────────────────────
//  Methods
// ─────────────────────────────────────────────

shiftAssignmentSchema.methods.cancel = async function (userId, reason) {
  if (this.status === 'cancelled') {
    throw new Error('ShiftAssignment is already cancelled');
  }
  this.status              = 'cancelled';
  this.cancelledBy         = userId;
  this.cancelledAt         = new Date();
  this.cancellationReason  = reason;
  await this.save();
};

const ShiftAssignment = mongoose.model('ShiftAssignment', shiftAssignmentSchema);

module.exports = { ShiftAssignment };







// const mongoose = require('mongoose');

// // ═══════════════════════════════════════════════════════════
// //  ShiftAssignment Model
// // ═══════════════════════════════════════════════════════════

// const shiftAssignmentSchema = new mongoose.Schema({
//   user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User',         required: true, index: true },
//   // FIX BUG-SA-03 [MEDIUM] — Added index to organizationId (was missing)
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   shiftId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Shift',        required: true },
//   shiftGroupId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftGroup' },

//   startDate: { type: Date, required: true, index: true },
//   endDate:   Date, // null = ongoing

//   isTemporary: { type: Boolean, default: false },

//   rotationSequence: Number,
//   rotationEndDate:  Date,

//   overrides: {
//     startTime:       String,
//     endTime:         String,
//     breakDuration:   Number,
//     weeklyOffs:      [Number],
//   },

//   status: {
//     type: String,
//     enum: ['active', 'expired', 'cancelled'],
//     default: 'active',
//     index: true,
//   },

//   reason: String,

//   assignedBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   assignedAt:          { type: Date, default: Date.now },
//   cancelledBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   cancelledAt:         Date,
//   cancellationReason:  String,

// }, { timestamps: true });

// // ─────────────────────────────────────────────
// //  Indexes
// // ─────────────────────────────────────────────
// shiftAssignmentSchema.index({ user: 1, status: 1, startDate: -1 });
// shiftAssignmentSchema.index({ organizationId: 1, shiftId: 1, status: 1 });
// shiftAssignmentSchema.index({ endDate: 1 }, { sparse: true });

// // ─────────────────────────────────────────────
// //  Pre-Validate
// // ─────────────────────────────────────────────

// // FIX BUG-SA-02 [MEDIUM] — Validate startDate < endDate
// shiftAssignmentSchema.pre('validate', function (next) {
//   if (this.endDate && this.startDate && this.endDate < this.startDate) {
//     return next(new Error('ShiftAssignment endDate must be on or after startDate'));
//   }
//   next();
// });

// // ─────────────────────────────────────────────
// //  Virtuals
// // ─────────────────────────────────────────────

// // FIX BUG-SA-01 [HIGH] — isActive virtual documented: uses server UTC time.
// // In production, compare against org timezone using a timezone library (e.g. luxon).
// shiftAssignmentSchema.virtual('isActiveNow').get(function () {
//   const now = new Date(); // UTC — ensure server TZ is UTC in production
//   return (
//     this.status === 'active' &&
//     this.startDate <= now &&
//     (!this.endDate || this.endDate >= now)
//   );
// });

// // ─────────────────────────────────────────────
// //  Methods
// // ─────────────────────────────────────────────

// shiftAssignmentSchema.methods.cancel = async function (userId, reason) {
//   if (this.status === 'cancelled') {
//     throw new Error('ShiftAssignment is already cancelled');
//   }
//   this.status              = 'cancelled';
//   this.cancelledBy         = userId;
//   this.cancelledAt         = new Date();
//   this.cancellationReason  = reason;
//   await this.save();
// };

// const ShiftAssignment = mongoose.model('ShiftAssignment', shiftAssignmentSchema);


// // ═══════════════════════════════════════════════════════════
// //  ShiftGroup Model
// // ═══════════════════════════════════════════════════════════

// const shiftGroupSchema = new mongoose.Schema({
//   name:        { type: String, required: true, trim: true },
//   code:        { type: String, required: true, trim: true, uppercase: true },
//   description: String,

//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },

//   shifts: [{
//     shiftId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
//     sequence: Number,
//     color:    String,
//   }],

//   rotationType: {
//     type: String,
//     enum: ['daily', 'weekly', 'monthly', 'custom'],
//     default: 'weekly',
//   },

//   rotationPattern: [{
//     dayOffset: Number,
//     shiftId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
//   }],

//   applicableDepartments:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
//   applicableDesignations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],

//   isActive:      { type: Boolean, default: true },
//   effectiveFrom: Date,
//   effectiveTo:   Date,

//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

// }, { timestamps: true });

// shiftGroupSchema.index({ organizationId: 1, code: 1 }, { unique: true });

// const ShiftGroup = mongoose.model('ShiftGroup', shiftGroupSchema);


// // ═══════════════════════════════════════════════════════════
// //  Designation Model
// // ═══════════════════════════════════════════════════════════

// const designationSchema = new mongoose.Schema({
//   title:       { type: String, required: true, trim: true },
//   code:        { type: String, required: false, trim: true, uppercase: true },
//   description: String,

//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

//   level: { type: Number, required: true, default: 1 },
//   grade: {
//     type: String,
//     enum: ['A', 'B', 'C', 'D', 'E', 'F'],
//     default: 'C',
//   },

//   nextDesignation:    { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
//   promotionAfterYears:Number,

//   jobFamily:           String,
//   responsibilities:    [String],
//   qualifications:      [String],
//   experienceRequired:  Number,

//   salaryBand: {
//     min:      Number,
//     max:      Number,
//     currency: { type: String, default: 'INR' },
//   },

//   reportsTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],

//   isActive: { type: Boolean, default: true, index: true },

//   metadata: {
//     isManager:        { type: Boolean, default: false },
//     isExecutive:      { type: Boolean, default: false },
//     requiresApproval: { type: Boolean, default: false },
//   },

//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

// }, { timestamps: true });

// // ─────────────────────────────────────────────
// //  Indexes
// // ─────────────────────────────────────────────
// designationSchema.index({ organizationId: 1, code: 1 }, { unique: true, sparse: true });
// designationSchema.index({ organizationId: 1, title: 1 }, { unique: true });
// designationSchema.index({ level: 1, grade: 1 });

// // ─────────────────────────────────────────────
// //  Pre-Validate
// // ─────────────────────────────────────────────

// // Guard: salaryBand.min must not exceed salaryBand.max
// designationSchema.pre('validate', function (next) {
//   if (
//     this.salaryBand &&
//     this.salaryBand.min !== undefined &&
//     this.salaryBand.max !== undefined &&
//     this.salaryBand.min > this.salaryBand.max
//   ) {
//     return next(new Error('salaryBand.min cannot exceed salaryBand.max'));
//   }
//   next();
// });

// // ─────────────────────────────────────────────
// //  Virtuals
// // ─────────────────────────────────────────────

// designationSchema.virtual('fullTitle').get(function () {
//   return this.code ? `${this.title} (${this.code})` : this.title;
// });

// const Designation = mongoose.model('Designation', designationSchema);


// // ─────────────────────────────────────────────
// //  Exports
// // ─────────────────────────────────────────────
// module.exports = { ShiftAssignment, ShiftGroup, Designation };






















// // const mongoose = require('mongoose');

// // const shiftAssignmentSchema = new mongoose.Schema({
// //   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
// //   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
// //   shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
// //   shiftGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftGroup' },
// //   // --- Assignment Period ---
// //   startDate: { type: Date, required: true, index: true },
// //   endDate: Date, // null = ongoing
// //   isTemporary: { type: Boolean, default: false },
// //   // --- Rotation Info (if from group) ---
// //   rotationSequence: Number,
// //   rotationEndDate: Date,
// //   // --- Override Rules ---
// //   overrides: { startTime: String, endTime: String, breakDuration: Number, weeklyOffs: [Number] },
// //   // --- Status ---
// //   status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active', index: true },
// //   // --- Reason for assignment ---
// //   reason: String,
// //   // --- Audit ---
// //   assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
// //   assignedAt: { type: Date, default: Date.now },
// //   cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
// //   cancelledAt: Date,
// //   cancellationReason: String

// // }, { timestamps: true });

// // // --- INDEXES ---
// // shiftAssignmentSchema.index({ user: 1, status: 1, startDate: -1 });
// // shiftAssignmentSchema.index({ organizationId: 1, shiftId: 1, status: 1 });
// // shiftAssignmentSchema.index({ endDate: 1 }, { sparse: true });

// // // --- VIRTUALS ---
// // shiftAssignmentSchema.virtual('isActive').get(function () {
// //   const now = new Date();
// //   return this.status === 'active' &&
// //     this.startDate <= now &&
// //     (!this.endDate || this.endDate >= now);
// // });

// // // --- METHODS ---
// // shiftAssignmentSchema.methods.cancel = async function (userId, reason) {
// //   this.status = 'cancelled';
// //   this.cancelledBy = userId;
// //   this.cancelledAt = new Date();
// //   this.cancellationReason = reason;
// //   await this.save();
// // };

// // module.exports = mongoose.model('ShiftAssignment', shiftAssignmentSchema);