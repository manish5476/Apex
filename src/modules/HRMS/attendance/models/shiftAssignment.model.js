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

module.exports = ShiftAssignment;
